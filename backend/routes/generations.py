"""TTS generation endpoints."""

import asyncio
import contextlib
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import config, models
from ..database import Generation as DBGeneration, VoiceProfile as DBVoiceProfile, get_db
from ..errors import (
    ERR_ACCESS_DENIED,
    ERR_AUDIO_NOT_FOUND,
    ERR_EMPTY_AUDIO,
    ERR_ENTITY_NOT_FOUND,
    ERR_FILE_TOO_LARGE_MB,
    ERR_FORMAT_UNSUPPORTED,
    ERR_GENERATION_NOT_FOUND,
    ERR_INVALID_CHUNK_INDEX,
    ERR_INVALID_GENERATION_ID,
    ERR_LLM_EMPTY_OUTPUT,
    ERR_NO_VOICE_PROFILE,
    ERR_ONLY_ACTIVE_CANCEL,
    ERR_ONLY_FAILED_RETRIES,
    ERR_PROFILE_NOT_FOUND,
    ERR_REGENERATE_COMPLETED,
)
from ..services import history, personality, profiles, versions
from ..services.generation import GenerationContext, run_generation
from ..services.task_queue import cancel_generation as cancel_generation_job, enqueue_generation
from ..utils.audio import load_audio, save_audio
from ..utils.model_status import pick_cached_tts_engine
from ..utils.tasks import get_task_manager

# Raised when no TTS engine is downloaded yet (no-default-model policy).
ERR_NO_ENGINE_DOWNLOADED = (
    "No TTS engine is downloaded yet. Download a model from the Models tab "
    "(or the recommended pack) before generating speech."
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _media_type_for(path: Path) -> str:
    """Pick a Content-Type for an audio file by extension."""
    return {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".webm": "audio/webm",
    }.get(path.suffix.lower(), "audio/wav")


@router.get("/audio/{generation_id}")
async def serve_generation_audio(generation_id: str, db: Session = Depends(get_db)):
    """Serve a generation's rendered audio file (used by the web player)."""
    generation = await history.get_generation(generation_id, db)
    audio_path = getattr(generation, "audio_path", None) if generation else None
    if not audio_path:
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.is_file():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    return FileResponse(resolved, media_type=_media_type_for(resolved))


@router.get("/audio/version/{version_id}")
async def serve_version_audio(version_id: str, db: Session = Depends(get_db)):
    """Serve a specific generation version's audio file."""
    version = versions.get_version(version_id, db)
    audio_path = getattr(version, "audio_path", None) if version else None
    if not audio_path:
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.is_file():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    return FileResponse(resolved, media_type=_media_type_for(resolved))


@router.get("/generations/{generation_id}/chunk/{chunk_index}")
async def serve_generation_chunk(generation_id: str, chunk_index: int):
    """Serve a streaming chunk file for progressive playback."""
    import re

    if not re.fullmatch(r"[0-9a-f\-]{36}", generation_id):
        raise HTTPException(status_code=400, detail=ERR_INVALID_GENERATION_ID)
    if chunk_index < 0:
        raise HTTPException(status_code=400, detail=ERR_INVALID_CHUNK_INDEX)

    generations_dir = config.get_generations_dir()
    chunk_path = (generations_dir / f"{generation_id}_chunk_{chunk_index}.wav").resolve()
    if not chunk_path.is_relative_to(generations_dir.resolve()):
        raise HTTPException(status_code=403, detail=ERR_ACCESS_DENIED)
    if not chunk_path.is_file():
        raise HTTPException(status_code=404, detail=ERR_ENTITY_NOT_FOUND)
    return FileResponse(chunk_path, media_type="audio/wav")


class GenerationFromAudioRequest(BaseModel):
    """Register an existing stored audio file as a Generation so it can be
    sequenced in a story (e.g. a copied/clipped segment from the editor)."""

    audio_path: str
    text: str = "Imported clip"
    profile_id: str | None = None
    engine: str = "import"


@router.post("/generations/from-audio", response_model=models.GenerationResponse)
async def create_generation_from_audio(
    data: GenerationFromAudioRequest,
    db: Session = Depends(get_db),
):
    """Create a Generation record from a stored audio file (no TTS).

    Computes duration from the file and attaches it to the first available
    voice profile (or a caller-supplied profile_id). Used by the clipboard
    paste flow so a copied clip can land in a story timeline.
    """
    resolved = config.resolve_storage_path(data.audio_path)
    if resolved is None or not resolved.is_file():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await asyncio.to_thread(load_audio, str(resolved))
    duration = len(audio) / sample_rate

    profile = None
    if data.profile_id:
        profile = db.query(DBVoiceProfile).filter_by(id=data.profile_id).first()
    if profile is None:
        profile = db.query(DBVoiceProfile).order_by(DBVoiceProfile.created_at).first()
    if profile is None:
        raise HTTPException(status_code=400, detail=ERR_NO_VOICE_PROFILE)

    generation = DBGeneration(
        id=str(uuid.uuid4()),
        profile_id=profile.id,
        text=data.text,
        language=profile.language or "en",
        audio_path=config.to_storage_path(resolved),
        duration=duration,
        engine=data.engine,
        status="completed",
        source="manual",
    )
    db.add(generation)
    db.commit()
    db.refresh(generation)
    return models.GenerationResponse.model_validate(generation)


_status_subscribers: dict[str, list[asyncio.Queue]] = {}
_status_lock = asyncio.Lock()
_status_creation_time: dict[str, float] = {}
_SSE_TTL_SECONDS = 600  # Evict stale subscriber entries after 10 minutes


async def notify_generation_status(generation_id: str, status: str, payload: dict) -> None:
    """Push status update to all SSE subscribers for this generation."""
    async with _status_lock:
        # Lazy cleanup: evict stale entries
        import time

        now = time.monotonic()
        stale_ids = [
            gid
            for gid, t in _status_creation_time.items()
            if now - t > _SSE_TTL_SECONDS and gid not in _status_subscribers
        ]
        for gid in stale_ids:
            _status_creation_time.pop(gid, None)

        queues = _status_subscribers.get(generation_id, [])
    for q in queues:
        with contextlib.suppress(asyncio.QueueFull):
            q.put_nowait(payload)


@router.get("/tts/status")
async def tts_status():
    """TTS backend health — mirrors GET /llm/status.

    Reports whether the default TTS backend is cached/loaded and any load
    error, so the UI can surface download/load failures instead of hanging on
    a silent cold start. No longer reads a non-existent ``context_size`` on
    the lifecycle manager (that crash returned 500 on this endpoint).
    """
    from ..backends import get_tts_backend

    backend = get_tts_backend()
    cached = backend._is_model_cached() if hasattr(backend, "_is_model_cached") else False
    loaded = backend.is_loaded() if hasattr(backend, "is_loaded") else False
    err = getattr(backend, "load_error", None)
    return {"loaded": loaded, "cached": cached, "engine": "kokoro", "load_error": err}


@router.get("/tts/engines")
async def list_tts_engines():
    """List available TTS engines with their cached status.

    Returns engines that are cached (loaded) versus those that are not,
    so the UI can show which models are installed and ready to use.
    """
    from ..backends import get_tts_backend_for_engine
    from ..utils.model_status import get_tts_preference_order, is_engine_cached

    engines = []
    preference = get_tts_preference_order()
    for engine in preference:
        # Resolution can fail for engines whose ONNX assets aren't
        # downloaded yet (ONNX-only entries raise ValueError). That must
        # not kill the whole listing — report the engine as uncached.
        try:
            get_tts_backend_for_engine(engine)
        except (ValueError, ImportError, RuntimeError, OSError) as exc:
            logger.debug("Engine %s unavailable (assets missing?): %s", engine, exc)
        if is_engine_cached(engine):
            engines.append({"engine": engine, "cached": True})
        else:
            engines.append({"engine": engine, "cached": False})
    return {"engines": engines}


IMPORTED_AUDIO_PROFILE_NAME = "Imported Audio"
IMPORT_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".webm"}
IMPORT_AUDIO_MAX_BYTES = config.IMPORT_AUDIO_MAX_BYTES


def _get_or_create_import_profile(db: Session) -> DBVoiceProfile:
    """Singleton profile every imported audio clip points at — keeps the
    Generation FK happy without making profile_id nullable across the schema."""
    row = db.query(DBVoiceProfile).filter(DBVoiceProfile.name == IMPORTED_AUDIO_PROFILE_NAME).first()
    if row is not None:
        return row
    row = DBVoiceProfile(
        id=str(uuid.uuid4()),
        name=IMPORTED_AUDIO_PROFILE_NAME,
        description="External audio imported into a story timeline.",
        language="en",
        voice_type="import",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _resolve_generation_engine(data: models.GenerationRequest, profile) -> str | None:
    """Resolve the TTS engine for a generation request.

    Preference order: explicit request engine, then the profile's stored
    default engine, then its preset engine. If none of those are downloaded
    yet, fall back to the first *downloaded* engine (dynamic, hardware-aware
    ranking) so we never assume a specific model exists. Returns ``None``
    when the user has not downloaded any compatible engine — callers must
    surface ``ERR_NO_ENGINE_DOWNLOADED``.
    """
    preferred = data.engine or getattr(profile, "default_engine", None) or getattr(profile, "preset_engine", None)
    return pick_cached_tts_engine(preferred=preferred)


@router.post("/generate", response_model=models.GenerationResponse)
async def generate_speech(
    data: models.GenerationRequest,
    db: Session = Depends(get_db),
):
    """Generate speech from text using a voice profile."""
    task_manager = get_task_manager()
    generation_id = str(uuid.uuid4())

    profile = await profiles.get_profile(data.profile_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail=ERR_PROFILE_NOT_FOUND)

    from ..backends import engine_has_model_sizes

    engine = _resolve_generation_engine(data, profile)
    if engine is None:
        raise HTTPException(status_code=400, detail=ERR_NO_ENGINE_DOWNLOADED)
    try:
        profiles.validate_profile_engine(profile, engine)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    model_size = (data.model_size or "default") if engine_has_model_sizes(engine) else None

    text = data.text
    source = "manual"
    if data.personality and getattr(profile, "personality", None):
        try:
            llm_result = await personality.rewrite_as_profile(profile.personality, data.text)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        text = llm_result.text.strip()
        if not text:
            raise HTTPException(status_code=500, detail=ERR_LLM_EMPTY_OUTPUT)
        source = "personality_speak"

    generation = await history.create_generation(
        profile_id=data.profile_id,
        text=text,
        language=data.language,
        audio_path="",
        duration=0,
        seed=data.seed,
        db=db,
        instruct=data.instruct,
        generation_id=generation_id,
        status="generating",
        engine=engine,
        model_size=model_size if engine_has_model_sizes(engine) else None,
        temperature=data.temperature,
        source=source,
        use_cloud=data.use_cloud,
    )

    task_manager.start_generation(
        task_id=generation_id,
        profile_id=data.profile_id,
        text=text,
    )

    effects_chain_config = None
    if data.effects_chain is not None:
        effects_chain_config = [e.model_dump() for e in data.effects_chain]
    else:
        import json as _json

        profile_obj = db.query(DBVoiceProfile).filter_by(id=data.profile_id).first()
        if profile_obj and profile_obj.effects_chain:
            try:
                effects_chain_config = _json.loads(profile_obj.effects_chain)
            except Exception as e:
                logger.warning("Failed to parse effects_chain from profile: %s", e)

    ctx = GenerationContext(
        generation_id=generation_id,
        profile_id=data.profile_id,
        text=text,
        language=data.language,
        engine=engine,
        model_size=model_size,
        seed=data.seed,
        mode="generate",
        normalize=data.normalize,
        effects_chain=effects_chain_config,
        instruct=data.instruct,
        temperature=data.temperature,
        max_chunk_chars=data.max_chunk_chars,
        crossfade_ms=data.crossfade_ms,
        emotion=data.emotion,
        voice_clean=data.voice_clean,
        streaming=data.streaming,
    )
    from ..utils.model_lifecycle import lifecycle_manager

    lifecycle_manager.mark_model_used(engine)
    enqueue_generation(generation_id, run_generation(ctx))

    return generation


@router.post("/generate/{generation_id}/retry", response_model=models.GenerationResponse)
async def retry_generation(generation_id: str, db: Session = Depends(get_db)):
    """Retry a failed generation using the same parameters."""
    from sqlalchemy import update as sql_update

    # Atomic status flip: only transition from 'failed' → 'generating'.
    # This prevents duplicate retries under concurrent requests.
    result = db.execute(
        sql_update(DBGeneration)
        .where(DBGeneration.id == generation_id, DBGeneration.status == "failed")
        .values(status="generating", error=None, audio_path="", duration=0)
    )
    db.commit()

    if result.rowcount == 0:
        gen = db.query(DBGeneration).filter_by(id=generation_id).first()
        if not gen:
            raise HTTPException(status_code=404, detail=ERR_GENERATION_NOT_FOUND)
        raise HTTPException(status_code=400, detail=ERR_ONLY_FAILED_RETRIES)

    db.expire_all()
    gen = db.query(DBGeneration).filter_by(id=generation_id).first()

    task_manager = get_task_manager()
    task_manager.start_generation(
        task_id=generation_id,
        profile_id=gen.profile_id,
        text=gen.text,
    )

    ctx = GenerationContext.from_db(gen, mode="retry")
    from ..utils.model_lifecycle import lifecycle_manager

    lifecycle_manager.mark_model_used(ctx.engine)
    enqueue_generation(generation_id, run_generation(ctx))

    return models.GenerationResponse.model_validate(gen)


@router.post(
    "/generate/{generation_id}/regenerate",
    response_model=models.GenerationResponse,
)
async def regenerate_generation(generation_id: str, db: Session = Depends(get_db)):
    """Re-run TTS with the same parameters and save the result as a new version."""
    gen = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not gen:
        raise HTTPException(status_code=404, detail=ERR_GENERATION_NOT_FOUND)
    if (gen.status or "completed") != "completed":
        raise HTTPException(status_code=400, detail=ERR_REGENERATE_COMPLETED)

    gen.status = "generating"
    gen.error = None
    db.commit()
    db.refresh(gen)

    task_manager = get_task_manager()
    task_manager.start_generation(
        task_id=generation_id,
        profile_id=gen.profile_id,
        text=gen.text,
    )

    version_id = str(uuid.uuid4())

    ctx = GenerationContext.from_db(gen, mode="regenerate", version_id=version_id)
    from ..utils.model_lifecycle import lifecycle_manager

    lifecycle_manager.mark_model_used(ctx.engine)
    enqueue_generation(generation_id, run_generation(ctx))

    return models.GenerationResponse.model_validate(gen)


@router.post("/generate/{generation_id}/cancel")
async def cancel_generation(generation_id: str, db: Session = Depends(get_db)):
    """Cancel a queued or running generation."""
    gen = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not gen:
        raise HTTPException(status_code=404, detail=ERR_GENERATION_NOT_FOUND)

    if (gen.status or "completed") not in ("loading_model", "generating"):
        raise HTTPException(status_code=400, detail=ERR_ONLY_ACTIVE_CANCEL)

    cancellation_state = cancel_generation_job(generation_id)
    if cancellation_state is None:
        # Row says active but the worker is no longer tracking it — the gen
        # coroutine exited without writing a terminal status (most often a
        # SQLite lock racing with the failed-status write inside the worker's
        # exception handler). Fail the row here so the user can move on.
        task_manager = get_task_manager()
        task_manager.complete_generation(generation_id)
        await history.update_generation_status(
            generation_id=generation_id,
            status="failed",
            db=db,
            error="Generation orphaned by worker",
        )
        await notify_generation_status(
            generation_id,
            "failed",
            {"id": generation_id, "status": "failed", "error": "Generation orphaned by worker"},
        )
        return {"message": "Orphaned generation cleared"}

    if cancellation_state == "queued":
        task_manager = get_task_manager()
        task_manager.complete_generation(generation_id)
        await history.update_generation_status(
            generation_id=generation_id,
            status="failed",
            db=db,
            error="Generation cancelled",
        )
        await notify_generation_status(
            generation_id,
            "failed",
            {"id": generation_id, "status": "failed", "error": "Generation cancelled"},
        )
        return {"message": "Queued generation cancelled"}

    return {"message": "Generation cancellation requested"}


@router.get("/generate/{generation_id}/status")
async def get_generation_status(generation_id: str, db: Session = Depends(get_db)):
    """SSE endpoint that streams generation status updates."""
    import json

    queue: asyncio.Queue = asyncio.Queue(maxsize=64)

    async with _status_lock:
        _status_subscribers.setdefault(generation_id, []).append(queue)
        import time

        _status_creation_time.setdefault(generation_id, time.monotonic())

    async def event_stream():
        try:
            db.expire_all()
            gen = db.query(DBGeneration).filter_by(id=generation_id).first()
            if not gen:
                yield f"data: {json.dumps({'status': 'not_found', 'id': generation_id})}\n\n"
                return

            payload = {
                "id": gen.id,
                "status": gen.status or "completed",
                "duration": gen.duration,
                "error": gen.error,
                "source": gen.source,
            }
            yield f"data: {json.dumps(payload)}\n\n"

            if (gen.status or "completed") in ("completed", "failed"):
                return

            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    # S4: 15s (not 30s) so reverse proxies with short idle
                    # timeouts don't reap the stream; matches /events/speak.
                    yield ": keepalive\n\n"
                    continue

                yield f"data: {json.dumps(payload)}\n\n"

                if payload.get("status") in ("completed", "failed"):
                    return
        except (BrokenPipeError, ConnectionResetError, asyncio.CancelledError):
            logger.debug("SSE client disconnected for generation %s", generation_id)
        finally:
            async with _status_lock:
                subs = _status_subscribers.get(generation_id, [])
                if queue in subs:
                    subs.remove(queue)
                if not subs:
                    _status_subscribers.pop(generation_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate/stream")
async def stream_speech(
    data: models.GenerationRequest,
    db: Session = Depends(get_db),
):
    """Generate speech and stream the WAV audio directly without saving to disk."""
    from ..backends import (
        engine_needs_trim,
        ensure_model_cached_or_raise,
        get_tts_backend_for_engine,
        load_engine_model,
    )

    profile = await profiles.get_profile(data.profile_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail=ERR_PROFILE_NOT_FOUND)

    engine = _resolve_generation_engine(data, profile)
    if engine is None:
        raise HTTPException(status_code=400, detail=ERR_NO_ENGINE_DOWNLOADED)
    try:
        profiles.validate_profile_engine(profile, engine)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    tts_model = get_tts_backend_for_engine(engine)
    model_size = data.model_size or "default"

    from ..utils.model_lifecycle import lifecycle_manager

    lifecycle_manager.mark_model_used(engine)
    await ensure_model_cached_or_raise(engine, model_size)
    await load_engine_model(engine, model_size)

    voice_prompt = await profiles.create_voice_prompt_for_profile(
        data.profile_id,
        db,
        engine=engine,
    )

    from ..utils.chunked_tts import generate_chunked

    trim_fn = None
    if engine_needs_trim(engine):
        from ..utils.audio import trim_tts_output

        trim_fn = trim_tts_output

    audio, sample_rate = await generate_chunked(
        tts_model,
        data.text,
        voice_prompt,
        language=data.language,
        seed=data.seed,
        instruct=data.instruct,
        temperature=data.temperature,
        max_chunk_chars=data.max_chunk_chars,
        crossfade_ms=data.crossfade_ms,
        trim_fn=trim_fn,
    )

    effects_chain_config = None
    if data.effects_chain is not None:
        effects_chain_config = [e.model_dump() for e in data.effects_chain]
    elif profile.effects_chain:
        import json as _json

        try:
            effects_chain_config = _json.loads(profile.effects_chain)
        except Exception as e:
            logger.warning("Failed to parse effects_chain: %s", e)
            effects_chain_config = None

    if effects_chain_config:
        from ..utils.async_audio import async_apply_effects

        audio = await async_apply_effects(audio, sample_rate, effects_chain_config)

    if data.normalize:
        from ..utils.async_audio import async_normalize_audio

        audio = await async_normalize_audio(audio)

    from ..utils.async_audio import async_audio_to_wav_bytes

    wav_bytes = await async_audio_to_wav_bytes(audio, sample_rate)

    async def _wav_stream():
        try:
            chunk_size = 64 * 1024
            for i in range(0, len(wav_bytes), chunk_size):
                yield wav_bytes[i : i + chunk_size]
        except (BrokenPipeError, ConnectionResetError, asyncio.CancelledError):
            logger.debug("Client disconnected during audio stream")

    return StreamingResponse(
        _wav_stream(),
        media_type="audio/wav",
        headers={"Content-Disposition": 'attachment; filename="speech.wav"'},
    )


@router.post("/generate/import", response_model=models.GenerationResponse)
async def import_audio(
    file: UploadFile = File(...),
    sanitize: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Register an external audio file as a generation row.

    ``sanitize`` (default off, lazy-loaded) runs the DeepFilterNet neural
    cleanup on import only when explicitly requested, so users who don't want
    cleanup are never forced to load the model.

    Designed for the story timeline so users can drop in music or other
    non-TTS audio. The row points at a singleton "Imported Audio" profile
    so the existing generation/story plumbing keeps working unchanged."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in IMPORT_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=ERR_FORMAT_UNSUPPORTED,
        )

    generation_id = str(uuid.uuid4())
    target = config.get_generations_dir() / f"{generation_id}{suffix}"
    total = 0
    try:
        with open(target, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > IMPORT_AUDIO_MAX_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=ERR_FILE_TOO_LARGE_MB,
                    )
                out.write(chunk)
    except Exception:
        with contextlib.suppress(OSError):
            target.unlink()
        raise
    if total == 0:
        with contextlib.suppress(OSError):
            target.unlink()
        raise HTTPException(status_code=400, detail=ERR_EMPTY_AUDIO)

    try:
        audio, sr = await asyncio.to_thread(load_audio, str(target))
        duration = float(len(audio) / sr) if sr else 0.0
    except Exception as decode_err:
        with contextlib.suppress(OSError):
            target.unlink()
        raise HTTPException(
            status_code=400,
            detail=f"Could not decode audio: {decode_err}",
        ) from decode_err

    if sanitize:
        try:
            from ..services.noise_reduction import reduce_noise_deepfilternet

            audio = await asyncio.to_thread(reduce_noise_deepfilternet, audio, int(sr))
            await asyncio.to_thread(save_audio, audio, str(target), int(sr))
        except Exception as clean_err:
            logger.warning("Import sanitization skipped: %s", clean_err)

    profile = _get_or_create_import_profile(db)
    display_name = Path(file.filename or "Imported audio").stem or "Imported audio"

    return await history.create_generation(
        profile_id=profile.id,
        text=display_name,
        language="en",
        audio_path=config.to_storage_path(target),
        duration=duration,
        seed=None,
        db=db,
        generation_id=generation_id,
        status="completed",
        engine="import",
        model_size=None,
        source="import",
    )
