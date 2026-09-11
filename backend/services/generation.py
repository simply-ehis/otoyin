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

logger = logging.getLogger(__name__)


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
        been created by older versions of the schema.
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
            instruct=gen.instruct,
            version_id=version_id,
            use_cloud=bool(getattr(gen, "use_cloud", False)),
            voice_clean=bool(getattr(gen, "voice_clean", False)),
        )


async def run_generation(ctx: GenerationContext) -> None:
    """Execute TTS inference and persist the result.

    Orchestrator that dispatches to cloud or local synthesis, then
    persists and notifies. Sub-functions own the details.
    """
    from ..routes.generations import notify_generation_status
    from ..utils.audio import save_audio

    task_manager = get_task_manager()
    bg_db = next(get_db())

    try:
        if ctx.use_cloud:
            audio, sample_rate = await _synthesize_cloud(ctx, bg_db)
        else:
            audio, sample_rate = await _synthesize_local(ctx, bg_db)

        # --- Post-processing pipeline (shared by cloud + local) ----------
        audio, sample_rate = _postprocess(ctx, audio, sample_rate)
        duration = len(audio) / sample_rate

        # --- Persist audio and update status -----------------------------
        final_path = _persist(ctx, audio, sample_rate, save_audio, bg_db)

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

        for orphan in _glob.glob(str(config.get_generations_dir() / f"{ctx.generation_id}*.wav")):
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
    raw = await with_retry(
        lambda: synthesize_via_cloud_tts("tts", ctx.text, voice=voice_name),
        attempts=3,
        label="tts.cloud",
    )
    audio_bytes, _ctype = raw
    return decode_wav_bytes(audio_bytes)


async def _synthesize_local(ctx: GenerationContext, db) -> tuple:
    """Run local TTS inference via the configured backend."""
    import time

    from ..backends import engine_needs_trim, get_tts_backend_for_engine, load_engine_model
    from ..routes.generations import notify_generation_status
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
        _stream_chunks.append((idx, chunk_audio, sr))
        if ctx.streaming:
            chunk_path = config.get_generations_dir() / f"{ctx.generation_id}_chunk_{idx}.wav"
            save_audio(chunk_audio, str(chunk_path), sr)
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
            logger.debug("TTS voice-clean failed (%s); continuing without", exc)

    # Normalize (generate/regenerate; retry skips)
    if ctx.normalize or ctx.mode == "regenerate":
        audio = normalize_audio(audio)

    # Emotion DSP (opt-in)
    if ctx.emotion and ctx.mode in ("generate", "regenerate"):
        try:
            from ..services.audio_tags import apply_emotion_dsp

            audio = apply_emotion_dsp(audio, sample_rate, ctx.emotion)
            logger.debug("Applied emotion DSP preset: %s", ctx.emotion)
        except Exception as exc:
            logger.debug("Emotion DSP failed (%s); continuing without", exc)

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
            versions_mod.set_default_version(versions_mod.list_versions(generation_id, db)[0].id, db)
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
