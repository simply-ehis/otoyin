"""On-demand preset-voice audition snippets.

Preset voices are synthesis parameters, not audio files, so hearing one
always costs a single inference run. This module synthesizes a fixed short
phrase per (engine, voice) once and caches the wav on disk — repeat
auditions are served instantly with no inference, no profile, and no
history rows.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# Fixed audition phrase — short on every engine, stable cache key, and no
# long-text abuse vector through the preview path.
PREVIEW_TEXT = "Hello! This is a preview of my voice."
PREVIEW_SEED = 7

# Serializes same-voice concurrent previews: without it two taps synthesize
# twice, contend the GPU, and race the cache write (Windows replace-while-open).
_preview_locks: dict[str, asyncio.Lock] = {}

# In-flight preview futures keyed by preview id — a second tap for the same
# voice awaits the running job instead of enqueuing a duplicate.
_preview_futures: dict[str, asyncio.Future] = {}


class PreviewBackpressureError(RuntimeError):
    """The generation queue is full — the caller should answer 429."""


def _preview_id(engine: str, voice_id: str) -> str:
    return f"preview:{engine}:{voice_id}"


def preview_cache_path(engine: str, voice_id: str) -> Path:
    """Disk location for a cached preset snippet.

    Keyed by sha256(engine + voice) so distinct ids can never collide
    (a naive sanitized filename maps both 'a/b' and 'a_b' to 'a_b').
    """
    from .. import config

    digest = hashlib.sha256(f"{engine}\0{voice_id}".encode()).hexdigest()[:16]
    safe_engine = re.sub(r"[^a-zA-Z0-9_-]", "_", engine)
    preview_dir = config.get_data_dir() / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    return preview_dir / f"preset__{safe_engine}__{digest}.wav"


def resolve_preset_config(engine: str, voice_id: str):
    """Return (config, voice_language) for a preset voice, or (None, None)."""
    from ..backends import get_all_model_configs

    for cfg in get_all_model_configs():
        if cfg.engine != engine:
            continue
        for v in cfg.structured_preset_voices:
            if v.id == voice_id:
                return cfg, v.language or "en"
    return None, None


def downloaded_preset_config(engine: str, voice_id: str):
    """Return the downloaded config backing a preset voice, or None.

    Multiple configs can share an engine (e.g. quant variants) — any
    downloaded one satisfies the marketplace gate.
    """
    from ..backends import get_all_model_configs
    from ..services.model_registry import is_downloaded

    for cfg in get_all_model_configs():
        if cfg.engine != engine:
            continue
        if not any(v.id == voice_id for v in cfg.structured_preset_voices):
            continue
        if is_downloaded(cfg.model_name, cfg.model_size):
            return cfg
    return None


async def get_or_synthesize_preview(engine: str, voice_id: str) -> Path:
    """Return the cached snippet path, synthesizing it on first audition.

    Synthesis runs as a preview-lane job on the serial generation queue, so
    a tap-to-hear never contends a running generation for the GPU — it waits
    for the active job, jumping ahead of merely waiting ones. Falls back to
    inline synthesis when the queue was never initialized (tests, scripts).

    Raises:
        ValueError: unknown engine/voice or model not downloaded.
        PreviewBackpressureError: the queue is full (answer 429).
        RuntimeError: synthesis produced no audio or the engine failed.
    """
    from .task_queue import _generation_queue, enqueue_generation

    cfg, voice_lang = resolve_preset_config(engine, voice_id)
    if cfg is None:
        raise ValueError(f"Unknown preset voice '{voice_id}' for engine '{engine}'")
    if downloaded_preset_config(engine, voice_id) is None:
        from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG

        raise ValueError(f"{MODEL_NOT_DOWNLOADED_MSG} ({cfg.model_name})")

    cached = preview_cache_path(engine, voice_id)
    if cached.is_file():
        return cached

    if _generation_queue is None:
        return await _synthesize_inline(engine, voice_id, voice_lang, cfg.model_size, cached)

    lock = _preview_locks.setdefault(f"{engine}\0{voice_id}", asyncio.Lock())
    async with lock:
        # Re-check: a concurrent audition may have filled the cache first.
        if cached.is_file():
            return cached
        loop = asyncio.get_running_loop()
        preview_id = _preview_id(engine, voice_id)
        existing = _preview_futures.get(preview_id)
        if existing is not None and not existing.done():
            return await existing
        fut: asyncio.Future = loop.create_future()
        _preview_futures[preview_id] = fut
        try:
            enqueue_generation(
                preview_id,
                _preview_job(engine, voice_id, voice_lang, cfg.model_size, cached, fut),
                lane="preview",
            )
        except RuntimeError as e:
            _preview_futures.pop(preview_id, None)
            raise PreviewBackpressureError(str(e)) from e
        return await fut


async def _preview_job(
    engine: str,
    voice_id: str,
    voice_lang: str,
    model_size: str,
    cached: Path,
    fut: asyncio.Future,
) -> None:
    """Queue-worker body: synthesize one snippet and settle the future."""
    from ..backends import get_tts_backend_for_engine, load_engine_model
    from ..utils.audio import save_audio
    from ..utils.model_lifecycle import lifecycle_manager

    try:
        await load_engine_model(engine, model_size)
        lifecycle_manager.mark_model_used(engine)
        backend = get_tts_backend_for_engine(engine)
        audio, sample_rate = await asyncio.to_thread(_synthesize_preview_sync, backend, engine, voice_id, voice_lang)
        if audio is None or len(audio) == 0 or not sample_rate:
            raise RuntimeError(f"Engine '{engine}' produced no audio for that preset voice")
        await asyncio.to_thread(save_audio, audio, str(cached), sample_rate)
        if not cached.is_file():
            raise RuntimeError("Preview synthesis produced no audio")
        if not fut.cancelled():
            fut.set_result(cached)
    except Exception as e:
        logger.debug("Preset preview failed for %s/%s", engine, voice_id, exc_info=True)
        if not fut.cancelled():
            fut.set_exception(e)
    finally:
        _preview_futures.pop(_preview_id(engine, voice_id), None)


async def _synthesize_inline(engine: str, voice_id: str, voice_lang: str, model_size: str, cached: Path) -> Path:
    """Direct synthesis fallback when no generation queue exists.

    Used by tests and scripts that never ran the app lifespan. Production
    always has the queue and takes the lane path above.
    """
    from ..backends import get_tts_backend_for_engine, load_engine_model
    from ..utils.audio import save_audio
    from ..utils.model_lifecycle import lifecycle_manager

    await load_engine_model(engine, model_size)
    lifecycle_manager.mark_model_used(engine)
    backend = get_tts_backend_for_engine(engine)
    try:
        audio, sample_rate = await asyncio.to_thread(_synthesize_preview_sync, backend, engine, voice_id, voice_lang)
    except Exception as e:
        logger.debug("Preset preview failed for %s/%s", engine, voice_id, exc_info=True)
        raise RuntimeError(f"Engine '{engine}' could not render that preset voice") from e
    if audio is None or len(audio) == 0 or not sample_rate:
        raise RuntimeError(f"Engine '{engine}' produced no audio for that preset voice")
    try:
        await asyncio.to_thread(save_audio, audio, str(cached), sample_rate)
    except OSError as e:
        logger.warning("Could not cache preset preview for %s/%s: %s", engine, voice_id, e)
    if not cached.is_file():
        raise RuntimeError("Preview synthesis produced no audio")
    return cached


def _synthesize_preview_sync(backend, engine: str, voice_id: str, language: str):
    """Blocking synthesis body — always runs in a worker thread.

    Backend generate() may be sync (torch/ONNX) or async; awaiting a sync
    return raises TypeError, so resolve awaitables explicitly.
    """
    import asyncio as _asyncio

    result = backend.generate(
        PREVIEW_TEXT,
        {"preset_engine": engine, "preset_voice_id": voice_id},
        language=language,
        seed=PREVIEW_SEED,
    )
    if inspect.isawaitable(result):
        result = _asyncio.run(result)
    return result
