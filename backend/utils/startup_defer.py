"""Deferred startup — lazy init gates for service-specific tasks.

Each service that can be deferred gets an asyncio.Event + Lock.
The first caller awaits ensure_*() which checks model availability,
runs init if cached, and sets the event.  Subsequent calls are instant
no-ops.

Rule: if the model isn't cached, the service doesn't start.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from .memory import available_mb, check_memory

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

# ── Background task set ────────────────────────────────────────────────
_background_tasks: set[asyncio.Task] = set()  # prevent GC of fire-and-forget tasks

# ── Events + Locks ──────────────────────────────────────────────────────
_kokoro_event = asyncio.Event()
_kokoro_lock = asyncio.Lock()

_planner_event = asyncio.Event()
_planner_lock = asyncio.Lock()

_vc_event = asyncio.Event()
_vc_lock = asyncio.Lock()

_mcp_event = asyncio.Event()
_mcp_lock = asyncio.Lock()

_manifest_event = asyncio.Event()
_manifest_lock = asyncio.Lock()

_engines_event = asyncio.Event()
_engines_lock = asyncio.Lock()

_notices_event = asyncio.Event()
_notices_lock = asyncio.Lock()

_catalog_event = asyncio.Event()
_catalog_lock = asyncio.Lock()


# ── Kokoro ONNX preload ────────────────────────────────────────────────
async def ensure_kokoro_preloaded() -> None:
    """Preload Kokoro ONNX on first TTS generation.

    Only runs if: (a) kokoro_onnx is importable, (b) model is cached,
    (c) preload is enabled in generation settings.  Never triggers a download.
    """
    if _kokoro_event.is_set():
        return
    async with _kokoro_lock:
        if _kokoro_event.is_set():
            return
        try:
            from ..backends.kokoro_onnx_backend import KokoroONNXBackend, is_onnx_available

            if not is_onnx_available():
                _kokoro_event.set()
                return
            _kokoro = KokoroONNXBackend()
            if not _kokoro._is_model_cached():
                logger.debug("Kokoro ONNX not cached — skipping preload")
                _kokoro_event.set()
                return
            # Manifest gate: don't preload models not downloaded via the Store.
            from ..backends.configs import get_all_model_configs
            from ..services.model_registry import is_downloaded

            cfg = next((c for c in get_all_model_configs() if c.engine == "kokoro"), None)
            if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
                logger.debug("Kokoro ONNX not entitled — skipping preload")
                _kokoro_event.set()
                return
            from ..database import get_db
            from ..services.settings import get_generation_settings

            db = await asyncio.to_thread(lambda: next(get_db()))
            try:
                if not get_generation_settings(db).preload_on_start:
                    logger.info("Engine preload disabled in settings; skipping")
                    return
            finally:
                db.close()
            if not check_memory("kokoro ONNX preload", required_mb=300):
                logger.warning("Kokoro preload skipped — low memory (%dMB free)", available_mb())
                _kokoro_event.set()
                return
            await _kokoro.load_model()
            _kokoro_event.set()
            logger.info("Kokoro ONNX preloaded (lazy)")
        except Exception:
            logger.debug("Kokoro preload skipped", exc_info=True)


# ── Planner LLM preload ───────────────────────────────────────────────
async def ensure_planner_preloaded() -> None:
    """Preload planner LLM on first assistant use.

    Only runs if the GGUF is already cached.  Never triggers a multi-GB download.
    """
    if _planner_event.is_set():
        return
    async with _planner_lock:
        if _planner_event.is_set():
            return
        try:
            from ..backends import get_llm_backend_for_engine

            backend = get_llm_backend_for_engine("gguf_llm")
            if not backend._is_model_cached(backend.model_size):
                logger.debug("Planner GGUF not cached — skipping preload")
                _planner_event.set()
                return
            # Manifest gate: don't preload models not downloaded via the Store.
            from ..backends.configs import get_all_model_configs
            from ..services.model_registry import is_downloaded

            cfg = next((c for c in get_all_model_configs() if c.engine == "gguf_llm"), None)
            if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
                logger.debug("Planner GGUF not entitled — skipping preload")
                _planner_event.set()
                return
            if not check_memory("planner LLM preload", required_mb=400):
                logger.warning("Planner preload skipped — low memory (%dMB free)", available_mb())
                _planner_event.set()
                return
            await backend.load_model()
            _planner_event.set()
            logger.info("Planner LLM pre-warmed (lazy)")
        except Exception:
            logger.debug("Planner preload skipped", exc_info=True)


# ── Voice-changer spawn ───────────────────────────────────────────────
async def ensure_vc_spawned() -> None:
    """Spawn voice-changer if enabled in settings.

    Only runs if voice_changer_enabled is true in persisted memory settings.
    """
    if _vc_event.is_set():
        return
    async with _vc_lock:
        if _vc_event.is_set():
            return
        try:
            from ..services.memory import get_voice_chat_settings

            vc_settings = get_voice_chat_settings()
            if not vc_settings.get("voice_changer_enabled"):
                _vc_event.set()
                return
            from ..voice_changer import spawn_voice_changer

            vc_port = vc_settings.get("voice_changer_port", 17494)
            spawn_voice_changer(port=vc_port)
            _vc_event.set()
        except Exception:
            logger.debug("Voice-changer auto-spawn skipped", exc_info=True)


# ── MCP server build ──────────────────────────────────────────────────
async def ensure_mcp_built(app: FastAPI) -> None:
    """Build MCP server + tool registry on first /mcp request.

    Expensive (~5s import) — only happens once, on demand.
    """
    if _mcp_event.is_set():
        return
    async with _mcp_lock:
        if _mcp_event.is_set():
            return
        try:
            from ..mcp_server.server import build_mcp_server

            mcp = build_mcp_server()
            mcp_app = mcp.http_app(path="/", transport="http")
            app.mount("/mcp", mcp_app)
            from ..tool_registry_populate import startup_verify

            tr_result = startup_verify(mcp)
            if tr_result["errors"]:
                for err in tr_result["errors"][:5]:
                    logger.warning("Tool registry: %s", err)
            _mcp_event.set()
            logger.info(
                "MCP: built and mounted (lazy) — %d tools (%d MCP, %d assistant, %d dual)",
                tr_result["total_tools"],
                tr_result["mcp_tools"],
                tr_result["assistant_tools"],
                tr_result["dual_surface"],
            )
        except Exception:
            logger.exception("MCP lazy build failed")


# ── Manifest reconciliation ───────────────────────────────────────────
async def ensure_manifest_synced() -> None:
    """Reconcile download manifest on first model load.

    Seeds the manifest from HF cache on first launch so bundled installs
    are entitled without re-download.
    """
    if _manifest_event.is_set():
        return
    async with _manifest_lock:
        if _manifest_event.is_set():
            return
        try:
            from ..services.model_registry import reconcile_downloads

            await asyncio.to_thread(reconcile_downloads)
            _manifest_event.set()
        except Exception:
            logger.debug("Manifest reconciliation skipped", exc_info=True)


# ── Engine registration ───────────────────────────────────────────────
async def ensure_engines_registered() -> None:
    """Register lifecycle engines on first generation.

    Only registers backends that have models cached — skips if no model
    is available, saving startup time and memory.
    """
    if _engines_event.is_set():
        return
    async with _engines_lock:
        if _engines_event.is_set():
            return
        try:
            from ..backends import get_llm_backend_for_engine, get_stt_backend, get_tts_backend, get_vc_backend
            from ..utils.model_lifecycle import lifecycle_manager

            try:
                tts = get_tts_backend()
                if not check_memory("TTS engine registration", required_mb=200):
                    logger.warning("TTS registration skipped — low memory (%dMB free)", available_mb())
                else:
                    lifecycle_manager.register("tts", tts.is_loaded, lambda: tts.unload_model())
            except Exception:
                logger.debug("TTS backend not registered (no model available)")

            try:
                stt = get_stt_backend()
                lifecycle_manager.register("whisper", stt.is_loaded, lambda: stt.unload_model())
            except Exception:
                logger.debug("STT backend not registered (no model available)")

            try:
                llm = get_llm_backend_for_engine("gguf_llm")
                lifecycle_manager.register("gguf_llm", llm.is_loaded, lambda: llm.unload_model())
            except Exception:
                logger.debug("LLM backend not registered (no model available)")

            try:
                rvc_backend = get_vc_backend("rvc_onnx")
                lifecycle_manager.register("rvc_onnx", rvc_backend.is_loaded, lambda: rvc_backend.unload_model())
            except Exception:
                logger.debug("RVC ONNX backend not registered (no model available)")

            try:
                seed_vc_backend = get_vc_backend("seed_vc")
                lifecycle_manager.register("seed_vc", seed_vc_backend.is_loaded, lambda: seed_vc_backend.unload_model())
            except Exception:
                logger.debug("Seed-VC backend not registered (no model available)")

            try:
                from ..backends.stable_audio_backend import stable_audio_backend

                lifecycle_manager.register(
                    "stable_audio",
                    stable_audio_backend.is_loaded,
                    lambda: stable_audio_backend.unload_model(),
                )
            except Exception:
                logger.debug("Stable Audio backend not registered (no model available)")

            try:
                from ..services.deepfilter_onnx import _is_session_loaded, unload_deepfilter

                lifecycle_manager.register("deepfilter", _is_session_loaded, unload_deepfilter)
            except Exception:
                logger.debug("DeepFilter not registered (no model available)")

            lifecycle_manager.start()
            _engines_event.set()
            logger.info("Lifecycle engines registered (lazy)")
        except Exception:
            logger.debug("Engine registration skipped", exc_info=True)


# ── Remote notices poll ───────────────────────────────────────────────
async def ensure_notices_started() -> None:
    """Start remote notices poll on first announcements access.

    Offline-first: failures are silent.
    """
    if _notices_event.is_set():
        return
    async with _notices_lock:
        if _notices_event.is_set():
            return
        try:
            from ..services.announcements import NOTICES_POLL_S, refresh_remote_announcements

            await asyncio.to_thread(refresh_remote_announcements)
            _notices_event.set()

            async def _poll() -> None:
                while True:
                    await asyncio.sleep(NOTICES_POLL_S)
                    try:
                        await asyncio.to_thread(refresh_remote_announcements)
                    except Exception:
                        logger.debug("Remote notices poll failed", exc_info=True)

            task = asyncio.create_task(_poll())
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)
            logger.info("Remote notices poll started (lazy)")
        except Exception:
            logger.debug("Remote notices refresh skipped", exc_info=True)


# ── Remote catalog poll ───────────────────────────────────────────────
async def ensure_catalog_started() -> None:
    """Start remote catalog poll on first marketplace access.

    Offline-first: failures are silent.
    """
    if _catalog_event.is_set():
        return
    async with _catalog_lock:
        if _catalog_event.is_set():
            return
        try:
            from ..services.marketplace_catalog import (
                REMOTE_CATALOG_POLL_S,
                refresh_remote_catalog_if_stale,
            )

            async def _poll() -> None:
                while True:
                    try:
                        await asyncio.to_thread(refresh_remote_catalog_if_stale)
                    except Exception:
                        logger.debug("Remote catalog refresh failed", exc_info=True)
                    await asyncio.sleep(REMOTE_CATALOG_POLL_S)

            await asyncio.to_thread(refresh_remote_catalog_if_stale)
            _catalog_event.set()
            task = asyncio.create_task(_poll())
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)
            logger.info("Remote catalog poll started (lazy)")
        except Exception:
            logger.debug("Remote catalog refresh skipped", exc_info=True)
