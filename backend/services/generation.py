"""
Unified TTS generation orchestration.

Replaces the three near-identical closures (_run_generation, _run_retry,
_run_regenerate) that lived in main.py with a single ``run_generation()``
function parameterized by *mode*.

Mode differences:
  - "generate"   : full pipeline -- save clean version, optionally apply
                    effects and create a processed version.
  - "retry"      : re-runs a failed generation with the same seed.
                    No effects, no version creation.
  - "regenerate" : re-runs with seed=None for variation.  Creates a new
                    version with an auto-incremented "take-N" label.
"""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import logging
from pathlib import Path
from typing import Literal

import numpy as np

from .. import config
from ..database import get_db
from ..utils.model_lifecycle import lifecycle_manager
from ..utils.tasks import get_task_manager
from . import history, profiles
from .status_bus import notify_generation_status

logger = logging.getLogger(__name__)


def ensure_ram_available(engine: str, model_size: str | None) -> None:
    """Raise HTTPException 507 when system RAM cannot hold the model.

    Shared by /generate and /generate/stream so both fail fast instead of
    OOM-killing the backend mid-inference. Detection failures skip the
    check (never block generation on a broken probe).
    """
    try:
        from fastapi import HTTPException as _HTTPException

        from ..backends import get_all_model_configs
        from ..services.device_capabilities import _get_system_ram_mb

        cfg = next(
            (
                c
                for c in get_all_model_configs()
                if c.engine == engine and (model_size is None or c.model_size == model_size)
            ),
            None,
        )
        if cfg is None or not (cfg.min_ram_mb or 0) > 0:
            return
        _total, available = _get_system_ram_mb()
        if available > 0 and available < cfg.min_ram_mb:
            raise _HTTPException(
                status_code=507,
                detail=(
                    f"Insufficient RAM: {engine} needs ~{cfg.min_ram_mb} MB "
                    f"but only {available} MB available. Close other apps and retry."
                ),
            )
    except Exception as exc:
        from fastapi import HTTPException as _HTTPException

        if isinstance(exc, _HTTPException):
            raise
        logger.debug("RAM pressure check skipped (detection failed)", exc_info=True)


@dataclasses.dataclass(frozen=True)
class GenerationContext:
    """Typed container for all generation parameters.

    Replaces the 20-parameter ``run_generation()`` signature with a single
    dataclass that can be constructed from request data or database records.
    The caller builds a GenerationContext; the service consumes it.
    """

    generation_id: str
    profile_id: str
    text: str
    language: str
    engine: str
    model_size: str
    seed: int | None
    mode: Literal["generate", "retry", "regenerate"] = "generate"
    normalize: bool = False
    effects_chain: list | None = None
    instruct: str | None = None
    temperature: float | None = None
    max_chunk_chars: int | None = None
    crossfade_ms: int | None = None
    version_id: str | None = None
    use_cloud: bool = False
    emotion: str | None = None
    voice_clean: bool = False
    streaming: bool = False

    @classmethod
    def from_request(
        cls, *, data, profile_id: str, generation_id: str, engine: str, model_size: str
    ) -> GenerationContext:
        """Build a GenerationContext from a FastAPI request model."""
        return cls(
            generation_id=generation_id,
            profile_id=profile_id,
            text=data.text,
            language=data.language,
            engine=engine,
            model_size=model_size,
            seed=data.seed,
            normalize=data.normalize,
            effects_chain=None,  # caller fills from profile if needed
            instruct=data.instruct,
            temperature=data.temperature,
            mode="generate",
            max_chunk_chars=data.max_chunk_chars,
            crossfade_ms=data.crossfade_ms,
            emotion=data.emotion,
            voice_clean=data.voice_clean,
        )

    @classmethod
    def from_db(cls, gen, *, mode: Literal["retry", "regenerate"], version_id: str | None = None) -> GenerationContext:
        """Build a GenerationContext from a database Generation record.

        Handles missing or None fields gracefully — DB records may have
        been created by older versions of the schema. normalize defaults
        to True (the request default) since it is not a stored column;
        effects/max_chunk_chars/crossfade_ms are generate-mode concerns
        (retry/regenerate save single files) and stay None.
        """
        return cls(
            generation_id=gen.id,
            profile_id=gen.profile_id,
            text=gen.text or "",
            language=gen.language or "en",
            engine=gen.engine or "",
            model_size=gen.model_size or "default",
            seed=gen.seed,
            mode=mode,
            normalize=True,
            instruct=gen.instruct,
            temperature=getattr(gen, "temperature", None),
            version_id=version_id,
            use_cloud=bool(getattr(gen, "use_cloud", False)),
            voice_clean=bool(getattr(gen, "voice_clean", False)),
        )


async def run_generation(ctx: GenerationContext) -> None:
    """Execute TTS inference and persist the result.

    Orchestrator that dispatches to cloud or local synthesis, then
    persists and notifies. Sub-functions own the details.
    """
    from ..utils.audio import save_audio

    task_manager = get_task_manager()
    bg_db = next(get_db())

    try:
        if ctx.use_cloud:
            audio, sample_rate = await _synthesize_cloud(ctx, bg_db)
        else:
            audio, sample_rate = await _synthesize_local(ctx, bg_db)

        # --- Post-processing pipeline (shared by cloud + local) ----------
        # Wrap synchronous DSP + disk I/O in to_thread to avoid blocking the
        # event loop (enhance_tts / normalize_audio / effects can be slow on
        # large buffers, and WAV writes do disk I/O).
        audio, sample_rate = await asyncio.to_thread(_postprocess, ctx, audio, sample_rate)
        if audio is None or len(audio) == 0 or not sample_rate:
            raise RuntimeError("Synthesis produced no audio")
        duration = len(audio) / sample_rate

        # --- Persist audio and update status -----------------------------
        final_path = await asyncio.to_thread(_persist, ctx, audio, sample_rate, save_audio, bg_db)

        await history.update_generation_status(
            generation_id=ctx.generation_id,
            status="completed",
            db=bg_db,
            audio_path=final_path,
            duration=duration,
        )
        await notify_generation_status(
            ctx.generation_id,
            "completed",
            {"id": ctx.generation_id, "status": "completed", "duration": duration},
        )

    except asyncio.CancelledError:
        import glob as _glob

        # Narrow globs: the main file plus this run's stream chunks only.
        # A broad f"{id}*.wav" would also wipe prior committed takes
        # ({id}_{suffix}.wav) and processed versions ({id}_processed.wav).
        for pattern in (f"{ctx.generation_id}.wav", f"{ctx.generation_id}_chunk_*.wav"):
            for orphan in _glob.glob(str(config.get_generations_dir() / pattern)):
                with contextlib.suppress(OSError):
                    Path(orphan).unlink()
        await history.update_generation_status(
            generation_id=ctx.generation_id,
            status="failed",
            db=bg_db,
            error="Generation cancelled",
        )
        await notify_generation_status(
            ctx.generation_id,
            "failed",
            {"id": ctx.generation_id, "status": "failed", "error": "Generation cancelled"},
        )
        _notify_speak_end(ctx.generation_id, status="cancelled")
    except Exception as exc:
        logger.exception("Generation failed for %s", ctx.generation_id)
        _err_detail = f"{type(exc).__name__}: {exc}"
        await history.update_generation_status(
            generation_id=ctx.generation_id,
            status="failed",
            db=bg_db,
            error=_err_detail[:500],
        )
        await notify_generation_status(
            ctx.generation_id,
            "failed",
            {"id": ctx.generation_id, "status": "failed", "error": _err_detail[:500]},
        )
        _notify_speak_end(ctx.generation_id, status="failed")
    else:
        _notify_speak_end(ctx.generation_id, status="completed")
    finally:
        task_manager.complete_generation(ctx.generation_id)
        bg_db.close()

        # Chunk janitor: streaming leaves {id}_chunk_*.wav files behind that
        # nothing ever reaps (the player switches to the assembled file on
        # completion). Narrow pattern only — never main/version files.
        # The cancel path already removes its own chunks the same way.
        delete_chunk_files(ctx.generation_id)

        # Proactive GPU memory cleanup after every generation outcome
        # (success, failure, cancellation).  gc.collect() must run first
        # so CUDA tensors held by dead Python objects are released before
        # empty_cache reclaims the freed blocks.
        try:
            from ..backends.base import cleanup_gpu_memory

            cleanup_gpu_memory(log=False)
        except Exception as exc:
            logger.debug("GPU memory cleanup failed (non-fatal): %s", exc)


async def _synthesize_cloud(ctx: GenerationContext, db) -> tuple:
    """Route synthesis through a BYOK cloud TTS endpoint."""
    from ..services.cloud_provider import synthesize_via_cloud_tts
    from ..utils.audio import decode_wav_bytes
    from ..utils.rate_limiter import get_limiter, with_retry

    voice_prompt = await profiles.create_voice_prompt_for_profile(ctx.profile_id, db, use_cache=True, engine=ctx.engine)
    voice_name = voice_prompt.get("preset_voice_id", "alloy") if isinstance(voice_prompt, dict) else "alloy"

    await get_limiter("tts").acquire()
    # synthesize_via_cloud_tts is sync — run it off the event loop (awaiting
    # it directly raises TypeError and broke cloud TTS entirely). The
    # awaitable guard keeps this working if the provider ever goes async.
    import inspect as _inspect

    raw = await with_retry(
        lambda: asyncio.to_thread(synthesize_via_cloud_tts, "tts", ctx.text, voice=voice_name),
        attempts=3,
        label="tts.cloud",
    )
    if _inspect.isawaitable(raw):
        raw = await raw
    audio_bytes, _ctype = raw
    return await asyncio.to_thread(decode_wav_bytes, audio_bytes)


async def _synthesize_local(ctx: GenerationContext, db) -> tuple:
    """Run local TTS inference via the configured backend."""
    import time

    from ..backends import engine_needs_trim, get_tts_backend_for_engine, load_engine_model
    from ..utils.audio import save_audio, trim_tts_output
    from ..utils.chunked_tts import generate_chunked
    from ..utils.rate_limiter import get_limiter, with_retry

    tts_model = get_tts_backend_for_engine(ctx.engine)
    lifecycle_manager.mark_model_used(ctx.engine)

    # Manifest gate: never auto-download from the generation path.
    from ..backends import get_all_model_configs
    from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG, is_downloaded

    _cfg = next(
        (c for c in get_all_model_configs() if c.engine == ctx.engine and c.model_size == ctx.model_size),
        None,
    )
    if _cfg is not None and not is_downloaded(_cfg.model_name, _cfg.model_size):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail=f"{MODEL_NOT_DOWNLOADED_MSG} ({_cfg.model_name})",
        )

    t_start = time.monotonic()

    # Auto-download disabled — models must be downloaded via Settings > Models first.
    # The backend's model_load_progress raises ModelNotCachedError if not cached.

    if not tts_model.is_loaded():
        await history.update_generation_status(ctx.generation_id, "loading_model", db)
        await notify_generation_status(
            ctx.generation_id, "loading_model", {"id": ctx.generation_id, "status": "loading_model"}
        )

    await load_engine_model(ctx.engine, ctx.model_size)
    t_loaded = time.monotonic()

    voice_prompt = await profiles.create_voice_prompt_for_profile(
        ctx.profile_id,
        db,
        use_cache=True,
        engine=ctx.engine,
    )

    await history.update_generation_status(ctx.generation_id, "generating", db)
    await notify_generation_status(ctx.generation_id, "generating", {"id": ctx.generation_id, "status": "generating"})

    trim_fn = trim_tts_output if engine_needs_trim(ctx.engine) else None
    gen_kwargs: dict = dict(
        language=ctx.language,
        seed=ctx.seed if ctx.mode != "regenerate" else None,
        instruct=ctx.instruct,
        trim_fn=trim_fn,
    )
    if ctx.temperature is not None:
        gen_kwargs["temperature"] = ctx.temperature
    if ctx.max_chunk_chars is not None:
        gen_kwargs["max_chunk_chars"] = ctx.max_chunk_chars
    if ctx.crossfade_ms is not None:
        gen_kwargs["crossfade_ms"] = ctx.crossfade_ms

    # Streaming chunk callback
    _stream_chunks: list[tuple[int, np.ndarray, int]] = []

    async def _on_chunk(idx: int, total: int, chunk_audio, sr: int) -> None:
        from ..utils.model_lifecycle import lifecycle_manager as _lifecycle

        # Heartbeat so the idle-unload sweep never yanks the model
        # underneath a long multi-chunk synthesis.
        _lifecycle.mark_model_used(ctx.engine)
        _stream_chunks.append((idx, chunk_audio, sr))
        if ctx.streaming:
            chunk_path = config.get_generations_dir() / f"{ctx.generation_id}_chunk_{idx}.wav"
            await asyncio.to_thread(save_audio, chunk_audio, str(chunk_path), sr)
            await notify_generation_status(
                ctx.generation_id,
                "chunk_ready",
                {
                    "id": ctx.generation_id,
                    "status": "chunk_ready",
                    "chunk_index": idx,
                    "chunk_total": total,
                    "chunk_url": f"/generations/{ctx.generation_id}/chunk/{idx}",
                },
            )

    await get_limiter("tts").acquire()
    audio, sample_rate = await with_retry(
        lambda: generate_chunked(
            tts_model,
            ctx.text,
            voice_prompt,
            **gen_kwargs,
            on_chunk=_on_chunk if ctx.streaming else None,
        ),
        attempts=3,
        label="tts.generate",
    )
    t_inferred = time.monotonic()

    duration = len(audio) / sample_rate
    load_ms = (t_loaded - t_start) * 1000
    infer_ms = (t_inferred - t_loaded) * 1000
    rtf = infer_ms / (duration * 1000) if duration > 0 else 0
    logger.info(
        "BENCH engine=%s text=%dchars audio=%.1fs load=%.0fms infer=%.0fms RTF=%.2f",
        ctx.engine,
        len(ctx.text),
        duration,
        load_ms,
        infer_ms,
        rtf,
    )

    return audio, sample_rate


def _postprocess(ctx: GenerationContext, audio, sample_rate: int) -> tuple:
    """Apply enhancement, normalization, and emotion DSP."""
    from ..utils.audio import normalize_audio

    # Voice clean (opt-in)
    if ctx.voice_clean:
        try:
            from ..services.tts_enhancer import enhance_tts

            audio = enhance_tts(audio, sample_rate, engine=ctx.engine)
            logger.debug("Applied TTS voice-clean enhancement")
        except Exception as exc:
            logger.warning("TTS voice-clean requested but failed (%s); continuing without", exc)

    # Normalize (generate/regenerate preserve the request flag; retry skips)
    if ctx.normalize:
        audio = normalize_audio(audio)

    # Emotion DSP (opt-in)
    if ctx.emotion and ctx.mode in ("generate", "regenerate"):
        try:
            from ..services.audio_tags import apply_emotion_dsp

            audio = apply_emotion_dsp(audio, sample_rate, ctx.emotion)
            logger.debug("Applied emotion DSP preset: %s", ctx.emotion)
        except Exception as exc:
            logger.warning("Emotion DSP '%s' requested but failed (%s); continuing without", ctx.emotion, exc)

    return audio, sample_rate


def _persist(ctx: GenerationContext, audio, sample_rate: int, save_audio, db) -> str:
    """Dispatch to the correct save function based on mode."""
    if ctx.mode == "generate":
        return _save_generate(
            generation_id=ctx.generation_id,
            audio=audio,
            sample_rate=sample_rate,
            effects_chain=ctx.effects_chain,
            save_audio=save_audio,
            db=db,
        )
    if ctx.mode == "retry":
        return _save_retry(
            generation_id=ctx.generation_id,
            audio=audio,
            sample_rate=sample_rate,
            save_audio=save_audio,
        )
    # regenerate
    return _save_regenerate(
        generation_id=ctx.generation_id,
        version_id=ctx.version_id,
        audio=audio,
        sample_rate=sample_rate,
        save_audio=save_audio,
        db=db,
    )


def delete_chunk_files(generation_id: str) -> int:
    """Remove streamed chunk wavs for a generation. Narrow pattern only.

    Returns the number of files removed. Main audio and version takes
    (``{id}.wav``, ``{id}_{suffix}.wav``) are never touched.
    """
    removed = 0
    for orphan in sorted(config.get_generations_dir().glob(f"{generation_id}_chunk_*.wav")):
        with contextlib.suppress(OSError):
            orphan.unlink()
            removed += 1
    return removed


def _notify_speak_end(generation_id: str, *, status: str) -> None:
    """Publish a speak-end event; the frontend ignores unknown ids."""
    try:
        from ..mcp_server import events as mcp_events

        mcp_events.publish(
            "speak-end",
            {"generation_id": generation_id, "status": status},
        )
    except Exception as e:
        # Never let event pub/sub break generation completion.
        logging.debug("Failed to publish speak-end event for generation %s: %s", generation_id, e)


def _save_generate(
    *,
    generation_id: str,
    audio,
    sample_rate: int,
    effects_chain: list | None,
    save_audio,
    db,
) -> str:
    """Save clean version and optionally an effects-processed version.

    Returns the final audio path (processed if effects were applied,
    otherwise clean).
    """
    from . import versions as versions_mod

    clean_audio_path = config.get_generations_dir() / f"{generation_id}.wav"
    save_audio(audio, str(clean_audio_path), sample_rate)

    has_effects = effects_chain and any(e.get("enabled", True) for e in effects_chain)

    versions_mod.create_version(
        generation_id=generation_id,
        label="original",
        audio_path=config.to_storage_path(clean_audio_path),
        db=db,
        effects_chain=None,
        is_default=not has_effects,
    )

    final_audio_path = str(clean_audio_path)

    if has_effects:
        from ..utils.effects import apply_effects, validate_effects_chain

        assert effects_chain is not None

        error_msg = validate_effects_chain(effects_chain)
        if error_msg:
            import logging

            logging.getLogger(__name__).warning("invalid effects chain, skipping: %s", error_msg)
            existing = versions_mod.list_versions(generation_id, db)
            if existing:
                versions_mod.set_default_version(existing[0].id, db)
            else:
                logging.getLogger(__name__).warning(
                    "no versions to mark default for %s after invalid chain", generation_id
                )
        else:
            processed_audio = apply_effects(audio, sample_rate, effects_chain)
            processed_path = config.get_generations_dir() / f"{generation_id}_processed.wav"
            save_audio(processed_audio, str(processed_path), sample_rate)
            final_audio_path = str(processed_path)
            versions_mod.create_version(
                generation_id=generation_id,
                label="version-2",
                audio_path=config.to_storage_path(processed_path),
                db=db,
                effects_chain=effects_chain,
                is_default=True,
            )

            from .telemetry import track_event

            track_event(
                "effects_applied",
                {"effect_count": len([e for e in effects_chain if e.get("enabled", True)])},
            )

    return config.to_storage_path(final_audio_path)


def _save_retry(
    *,
    generation_id: str,
    audio,
    sample_rate: int,
    save_audio,
) -> str:
    """Save retry output -- single file, no versions.

    Returns the audio path.
    """
    audio_path = config.get_generations_dir() / f"{generation_id}.wav"
    save_audio(audio, str(audio_path), sample_rate)
    return config.to_storage_path(audio_path)


def _save_regenerate(
    *,
    generation_id: str,
    version_id: str | None,
    audio,
    sample_rate: int,
    save_audio,
    db,
) -> str:
    """Save regeneration output as a new version with auto-label.

    Returns the audio path.
    """
    import uuid as _uuid

    from . import versions as versions_mod

    suffix = _uuid.uuid4().hex[:8]
    audio_path = config.get_generations_dir() / f"{generation_id}_{suffix}.wav"
    save_audio(audio, str(audio_path), sample_rate)

    # Count via DB query rather than list length to avoid TOCTOU race
    from ..database import GenerationVersion as DBGenerationVersion

    count = db.query(DBGenerationVersion).filter_by(generation_id=generation_id).count()
    label = f"take-{count + 1}"

    versions_mod.create_version(
        generation_id=generation_id,
        label=label,
        audio_path=config.to_storage_path(audio_path),
        db=db,
        effects_chain=None,
        is_default=True,
    )

    return config.to_storage_path(audio_path)
