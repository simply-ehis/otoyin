"""Startup self-check for STT backends.

Runs once at server boot (called from _run_startup) to load and unload
each STT backend once, verifying the full lifecycle works:

  instantiate → check cached → load → verify loaded → unload

This catches:
  - Import-time errors (missing native binaries, broken ONNX models)
  - Model cache corruption (files exist but are invalid)
  - Backend interface mismatches (protocol violations)
  - Runtime initialization failures (CUDA errors, missing tokens)

The check is best-effort: failures are logged as warnings but do NOT
prevent the server from starting.  Users can still download and use
the models after fixing the underlying issue.
"""

import asyncio
import contextlib
import logging
import time

logger = logging.getLogger(__name__)

# STT engines to check, in order of importance.
# Each tuple is (engine_name, display_name).
_STT_ENGINES = [
    ("whisper", "Whisper (whisper.cpp)"),
    ("faster-whisper", "Faster-Whisper"),
    ("parakeet", "Parakeet TDT 0.6B v3"),
    ("qwen3_asr", "Qwen3-ASR 1.7B"),
]


async def run_stt_self_check() -> dict[str, dict]:
    """Load and unload each STT backend once to verify end-to-end functionality.

    Returns a dict mapping engine name to a result dict with keys:
      - status: "ok" | "skipped" | "error"
      - message: human-readable status message
      - load_ms: time in ms to load (0 if skipped/error)
      - is_cached: whether model files exist on disk
    """
    from ..backends.registry import get_stt_backend

    results: dict[str, dict] = {}

    for engine, display_name in _STT_ENGINES:
        result = await _check_single_backend(engine, display_name, get_stt_backend)
        results[engine] = result

    # Log summary
    ok_count = sum(1 for r in results.values() if r["status"] == "ok")
    skip_count = sum(1 for r in results.values() if r["status"] == "skipped")
    err_count = sum(1 for r in results.values() if r["status"] == "error")

    if err_count:
        logger.warning(
            "STT self-check: %d OK, %d skipped, %d errors",
            ok_count,
            skip_count,
            err_count,
        )
    else:
        logger.info(
            "STT self-check: %d OK, %d skipped, 0 errors",
            ok_count,
            skip_count,
        )

    return results


async def _check_single_backend(
    engine: str,
    display_name: str,
    get_backend_fn,
) -> dict:
    """Check a single STT backend: instantiate → load → verify → unload."""
    t0 = time.monotonic()

    # Step 1: Instantiate
    try:
        backend = get_backend_fn(engine)
    except (ImportError, RuntimeError, ValueError) as exc:
        (time.monotonic() - t0) * 1000
        logger.warning("STT self-check [%s]: instantiation failed: %s", display_name, exc)
        return {
            "status": "error",
            "message": f"Instantiation failed: {exc}",
            "load_ms": 0,
            "is_cached": False,
        }

    # Step 2: Check if model is cached (on disk)
    try:
        is_cached = backend._is_model_cached(backend.model_size)
    except Exception:
        is_cached = False

    if not is_cached:
        (time.monotonic() - t0) * 1000
        logger.info(
            "STT self-check [%s]: skipped (model not cached, %s)",
            display_name,
            backend.model_size,
        )
        return {
            "status": "skipped",
            "message": f"Model not cached ({backend.model_size})",
            "load_ms": 0,
            "is_cached": False,
        }

    # Step 3: If already loaded, skip (don't unload a working model)
    if backend.is_loaded():
        logger.info(
            "STT self-check [%s]: OK (already loaded, %s)",
            display_name,
            backend.model_size,
        )
        return {
            "status": "ok",
            "message": f"Already loaded ({backend.model_size})",
            "load_ms": 0,
            "is_cached": True,
        }

    # Step 4: Load
    try:
        load_start = time.monotonic()
        await backend.load_model(backend.model_size)
        load_ms = (time.monotonic() - load_start) * 1000
    except Exception as exc:
        logger.warning(
            "STT self-check [%s]: load failed (%s): %s",
            display_name,
            backend.model_size,
            exc,
        )
        # Clean up partial state
        with contextlib.suppress(Exception):
            backend.unload_model()
        return {
            "status": "error",
            "message": f"Load failed ({backend.model_size}): {exc}",
            "load_ms": 0,
            "is_cached": True,
        }

    # Step 5: Verify loaded
    if not backend.is_loaded():
        backend.unload_model()
        logger.warning(
            "STT self-check [%s]: is_loaded() returned False after load",
            display_name,
        )
        return {
            "status": "error",
            "message": "is_loaded() returned False after successful load_model()",
            "load_ms": int(load_ms),
            "is_cached": True,
        }

    # Step 6: Unload
    try:
        backend.unload_model()
    except Exception as exc:
        logger.warning(
            "STT self-check [%s]: unload failed: %s",
            display_name,
            exc,
        )
        return {
            "status": "ok",
            "message": f"Load OK but unload failed: {exc}",
            "load_ms": int(load_ms),
            "is_cached": True,
        }

    logger.info(
        "STT self-check [%s]: OK (load=%.0fms, %s)",
        display_name,
        load_ms,
        backend.model_size,
    )
    return {
        "status": "ok",
        "message": f"Load/unload cycle OK ({backend.model_size}, {load_ms:.0f}ms)",
        "load_ms": int(load_ms),
        "is_cached": True,
    }


def run_stt_self_check_sync() -> dict[str, dict]:
    """Synchronous wrapper for run_stt_self_check().

    Used by startup code that isn't already in an async context.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context — create a task
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, run_stt_self_check())
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(run_stt_self_check())
    except RuntimeError:
        return asyncio.run(run_stt_self_check())
