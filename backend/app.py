"""FastAPI application factory, middleware, and lifecycle events."""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import ClassVar
from urllib.parse import urlparse


class ColoredFormatter(logging.Formatter):
    """Custom formatter to add colors matching uvicorn's style."""

    COLORS: ClassVar[dict[str, str]] = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record):
        log_color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{log_color}{record.levelname}{self.RESET}"
        return super().format(record)


class _JSONFormatter(logging.Formatter):
    """Opt-in JSON structured log formatter for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        import json

        log_entry = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        return json.dumps(log_entry, default=str)


# Configure logging to match uvicorn's format with colors
# Set OTOYIN_LOG_FORMAT=json for structured JSON output (legacy: TWENTYLABS_LOG_FORMAT).
_log_format = os.environ.get("OTOYIN_LOG_FORMAT") or os.environ.get("TWENTYLABS_LOG_FORMAT", "text")
if _log_format == "json":
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(_JSONFormatter())
else:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(ColoredFormatter("%(levelname)s:     %(message)s"))
logging.basicConfig(
    level=logging.INFO,
    handlers=[handler],
)

logger = logging.getLogger(__name__)


def _set_gpu_env_vars() -> None:
    """Set AMD GPU environment variables before torch import.

    Called once during app creation, not at module import time, to avoid
    polluting the process environment for tests, scripts, and tools.
    """
    if not os.environ.get("HSA_OVERRIDE_GFX_VERSION"):
        os.environ["HSA_OVERRIDE_GFX_VERSION"] = "10.3.0"
    if not os.environ.get("MIOPEN_LOG_LEVEL"):
        os.environ["MIOPEN_LOG_LEVEL"] = "4"


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, config, database
from .database import get_db
from .routes import register_routers
from .services.task_queue import create_background_task, init_queue
from .utils.platform_detect import get_backend_type
from .utils.progress import get_progress_manager


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Heavy imports (MCP server, assistant_tools, tool_dispatch) are deferred
    to the lifespan or first use so the process starts accepting HTTP
    requests in ~3 s instead of ~11 s.
    """
    _set_gpu_env_vars()
    from .mcp_server.context import ClientIdMiddleware

    # ── Deferred MCP build ──────────────────────────────────────────
    # The MCP server + tool registration cost ~5 s of import time
    # (assistant_tools schema cascade, tool_dispatch, FastMCP).  We
    # build it lazily during the ASGI lifespan so the HTTP server can
    # start accepting /health probes immediately.
    _mcp_app_holder: dict[str, object] = {}

    @asynccontextmanager
    async def otoyin_lifespan(app: FastAPI):
        _init_ready_event()

        # Build MCP server in background so it doesn't block the
        # readiness gate — /health and /health/ready are served while
        # this runs.
        try:
            from .mcp_server.server import build_mcp_server, compose_lifespan

            mcp = build_mcp_server()
            mcp_app = mcp.http_app(path="/", transport="http")
            _mcp_app_holder["app"] = mcp_app

            # Mount the MCP sub-app *after* build so the OpenAPI spec
            # is complete by the time /docs loads.
            app.mount("/mcp", mcp_app)
            logger.info("MCP: mounted at /mcp")

            # Tool registry verification (also defers assistant_tools
            # import until tools are actually registered).
            try:
                from .tool_registry_populate import startup_verify

                tr_result = startup_verify(mcp)
                if tr_result["errors"]:
                    for err in tr_result["errors"][:5]:
                        logger.warning("Tool registry: %s", err)
                logger.info(
                    "Tool registry: %d total (%d MCP, %d assistant, %d dual)",
                    tr_result["total_tools"],
                    tr_result["mcp_tools"],
                    tr_result["assistant_tools"],
                    tr_result["dual_surface"],
                )
            except Exception as e:
                logger.debug("Tool registry verification skipped: %s", e)
        except Exception:
            logger.exception("MCP server build failed — MCP endpoint unavailable")

        try:
            await _run_startup(app)
            yield
        finally:
            await _run_shutdown()

    application = FastAPI(
        title="otoyin API",
        description="AI Audio Studio for otoyin — voice cloning, TTS, music, and SFX generation",
        version=__version__,
        lifespan=otoyin_lifespan,
    )

    trusted_origins = _configure_cors(application)
    from .utils.origin_guard import OriginGuardMiddleware

    application.add_middleware(OriginGuardMiddleware, allowed_origins=trusted_origins)
    application.add_middleware(ClientIdMiddleware)

    # Readiness middleware: holds non-health requests until background init
    # completes.  /health* is always served immediately so the Tauri frontend
    # can poll for readiness.  Other requests get 503 + Retry-After header
    # telling clients to back off.
    import starlette.middleware.base
    import starlette.responses

    health_paths = ("/health", "/health/filesystem")

    class ReadinessMiddleware(starlette.middleware.base.BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            # Always let health endpoints through — they're the readiness signal.
            path = request.url.path
            if any(path == hp or path.startswith(hp + "/") for hp in health_paths):
                return await call_next(request)

            # Let Swagger/OpenAPI/docs through during startup so devs can
            # inspect the API spec even before models are loaded.
            if path in ("/docs", "/redoc", "/openapi.json"):
                return await call_next(request)

            # If not ready, return 503 with Retry-After so clients back off
            # instead of hammering the server during startup.
            if not _is_ready():
                error = _get_startup_error()
                if error:
                    return starlette.responses.JSONResponse(
                        status_code=503,
                        content={"detail": f"Startup failed: {error}"},
                        headers={"Retry-After": "10"},
                    )
                return starlette.responses.JSONResponse(
                    status_code=503,
                    content={"detail": "Server is initializing"},
                    headers={"Retry-After": "2"},
                )

            return await call_next(request)

    application.add_middleware(ReadinessMiddleware)

    from .backends.base import ModelNotCachedError

    @application.exception_handler(ModelNotCachedError)
    async def model_not_cached_handler(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"detail": "Model not cached"})

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc):
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    register_routers(application)
    # MCP mount deferred to lifespan (see above) — the /mcp endpoint
    # returns 503 until the lifespan builds the MCP server.
    _mount_frontend(application)

    return application


def _configure_cors(application: FastAPI) -> list[str]:
    """Set up CORS middleware with local-first defaults.

    Returns the effective allowlist so other layers (e.g. the Origin
    guard) can share the exact same set of trusted origins.
    """
    from .config import get_server_port

    _port = get_server_port()
    default_origins = [
        "http://localhost:21132",  # Vite dev server (canonical)
        "http://127.0.0.1:21132",
        "http://localhost:5173",  # legacy Vite fallback (compat)
        "http://127.0.0.1:5173",
        f"http://localhost:{_port}",
        f"http://127.0.0.1:{_port}",
        "tauri://localhost",  # Tauri webview (macOS)
        "https://tauri.localhost",  # Tauri webview (Windows/Linux)
        "http://tauri.localhost",  # Tauri webview (Windows, some builds)
    ]
    env_origins = os.environ.get("OTOYIN_CORS_ORIGINS") or os.environ.get("TWENTYLABS_CORS_ORIGINS", "")
    all_origins = list(default_origins)
    for o in env_origins.split(","):
        o = o.strip()
        if not o:
            continue
        # Wildcard is incompatible with allow_credentials and would let any
        # site call this server with the user's cookies — reject it.
        if o == "*":
            logger.warning("Ignoring OTOYIN_CORS_ORIGINS='*' (incompatible with allow_credentials)")
            continue
        # Basic scheme validation: must be http(s) origin with no path.
        parsed = urlparse(o)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or (parsed.path not in ("", "/")):
            logger.warning("Ignoring invalid OTOYIN_CORS_ORIGINS entry: %s", o)
            continue
        all_origins.append(o)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=all_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    return all_origins


def _mount_frontend(application: FastAPI) -> None:
    """Serve the built web frontend when present (Docker / web deployment).

    The Dockerfile copies the Vite build output to ``/app/frontend/``.  When
    that directory exists we mount static assets and add a catch-all route so
    the React SPA handles client-side routing.  In dev or API-only mode the
    directory is absent and this function is a no-op.
    """
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    if not frontend_dir.is_dir():
        return

    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    # Mount hashed assets (JS, CSS, images) that Vite places under /assets
    assets_dir = frontend_dir / "assets"
    if assets_dir.is_dir():
        application.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="frontend-assets",
        )

    # SPA catch-all: serve files if they exist, otherwise index.html for
    # client-side routes like /voices, /stories, /models, etc.
    @application.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = (frontend_dir / full_path).resolve()
        # Guard against path traversal — only serve files inside frontend_dir
        if full_path and file_path.is_file() and file_path.is_relative_to(frontend_dir):
            return FileResponse(file_path)
        return FileResponse(frontend_dir / "index.html", media_type="text/html")

    logger.info("Frontend: serving SPA from %s", frontend_dir)


def _get_gpu_status() -> str:
    """Return a human-readable string describing GPU availability.

    torch is imported lazily here (not at module top) so the app boots without
    paying the torch import cost unless a torch model or GPU probe is requested.
    """
    try:
        import torch
    except ImportError:
        return "unavailable (torch not installed)"

    if torch.cuda.is_available():
        from .backends.base import check_cuda_compatibility

        device_name = torch.cuda.get_device_name(0)
        compatible, _warning = check_cuda_compatibility()
        is_rocm = hasattr(torch.version, "hip") and torch.version.hip is not None
        if is_rocm:
            label = f"ROCm ({device_name})"
        else:
            label = f"CUDA ({device_name})"
        if not compatible:
            label += " [UNSUPPORTED - see logs]"
        return label
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "MPS (Apple Silicon)"

    # Intel XPU (Arc / Data Center) via IPEX
    try:
        import intel_extension_for_pytorch

        if hasattr(torch, "xpu") and torch.xpu.is_available():
            try:
                xpu_name = torch.xpu.get_device_name(0)
            except Exception:
                xpu_name = "Intel GPU"
            return f"XPU ({xpu_name})"
    except ImportError:
        pass

    return "None (CPU only)"


async def _run_startup(application: FastAPI) -> None:
    """Database init, warnings, model-cache prep. Runs on lifespan entry."""
    import platform
    import re
    import sys

    # Detect uvicorn --port from argv so MCP tools can call back to the REST API.
    if "OTOYIN_PORT" not in os.environ and "TWENTYLABS_PORT" not in os.environ:
        for i, arg in enumerate(sys.argv):
            if arg == "--port" and i + 1 < len(sys.argv):
                os.environ["OTOYIN_PORT"] = sys.argv[i + 1]
                break
            if arg.startswith("--port="):
                os.environ["OTOYIN_PORT"] = arg.split("=", 1)[1]
                break

    logger.info("otoyin v%s starting up", __version__)
    logger.info(
        "Python %s on %s %s (%s)",
        sys.version.split()[0],
        platform.system(),
        platform.release(),
        platform.machine(),
    )

    # ── Critical init: database ────────────────────────────────────────
    # Wrap in try/except so a corrupt DB or missing directory surfaces a
    # clear error instead of a raw traceback that kills the server.
    try:
        database.init_db()
    except Exception as exc:
        _signal_startup_error(f"Database initialization failed: {exc}")
        return  # don't continue — the rest of startup depends on the DB

    from .database.session import _db_path

    logger.info("Database: %s", _db_path)
    logger.info("Data directory: %s", config.get_data_dir())

    init_queue()

    try:
        from .services.batch import start_worker

        start_worker()
        logger.info("Batch worker started")
    except Exception as exc:
        logger.warning("Batch worker failed to start (generations may queue but not process): %s", exc)

    # Run comprehensive startup stale-state detection and cleanup.
    # Purges leftover sentinels, orphaned records, stale autosave snapshots,
    # and orphaned audio files left behind by crashed/killed sessions.
    db = next(get_db())
    try:
        from .utils.startup_cleanup import purge_stale_state

        purge_stale_state(db, config.get_data_dir())

        from .database import Generation as DBGeneration, VoiceProfile as DBVoiceProfile

        profile_count = db.query(DBVoiceProfile).count()
        generation_count = db.query(DBGeneration).count()
        logger.info("Profiles: %d, Generations: %d", profile_count, generation_count)

        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Startup cleanup failed: %s", e)
    finally:
        db.close()

    from .utils.platform_detect import log_platform_info

    log_platform_info()

    # Install cross-platform signal handlers for graceful shutdown.
    # On Unix, SIGTERM already triggers uvicorn's shutdown; our handler
    # layers on top to also call _run_shutdown() and sys.exit(0).
    # On Windows, uvicorn doesn't handle SIGTERM, so we own it entirely.
    _install_signal_handlers()

    # Defer heavy GPU/LLM imports to background so the HTTP server starts fast.
    async def _bg_checks() -> None:
        # Seed the download manifest from the HF cache on first launch so bundled
        # installs are entitled without forcing a re-download. No-op after the
        # first row exists.
        try:
            from .services.model_registry import reconcile_downloads

            reconcile_downloads()
        except Exception as e:
            logger.warning("Model manifest reconciliation failed: %s", e)

        # Populate the health endpoint GPU snapshot eagerly at startup so
        # the first /health poll (Tauri frontend bootstrap) is instant.
        # This also runs the CUDA compatibility check as a side effect.
        try:
            from .routes.health import _get_gpu_snapshot

            # Thread-safe: uses double-checked locking inside _get_gpu_snapshot.
            # Blocks the event loop briefly on first call (torch import),
            # but runs in background so it doesn't delay server readiness.
            snap = await asyncio.to_thread(_get_gpu_snapshot)
            if snap.get("gpu_compatibility_warning"):
                logger.warning("GPU COMPATIBILITY: %s", snap["gpu_compatibility_warning"])
        except Exception as e:
            logger.debug("GPU snapshot probe deferred: %s", e)

        # CUDA binary auto-update disabled — users download via Settings > Models.

        # STT self-check: load/unload each backend once to verify lifecycle.
        # Catches import errors, model cache corruption, and interface mismatches.
        # Best-effort: failures are logged, not fatal.
        try:
            from .utils.stt_self_check import run_stt_self_check

            stt_results = await run_stt_self_check()
            stt_errors = [k for k, v in stt_results.items() if v["status"] == "error"]
            if stt_errors:
                logger.warning("STT self-check errors: %s", stt_errors)
        except Exception as e:
            logger.debug("STT self-check deferred: %s", e)

    create_background_task(_bg_checks())

    # Register model engines with the lifecycle manager so heavy models are
    # idle-unloaded; the planner LLM is pre-warmed above and also idle-unloads.
    # See utils/model_lifecycle.py.
    from .utils.model_lifecycle import lifecycle_manager

    def _register_lifecycle_engines() -> None:
        from .backends import get_llm_backend_for_engine, get_stt_backend, get_tts_backend, get_vc_backend

        # Only register backends that have models available — skip if the
        # backend getter fails (no models installed / cached).  This avoids
        # instantiating heavy backend objects when the user has nothing to
        # use yet, saving startup time and memory.
        try:
            tts = get_tts_backend()
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
            lifecycle_manager.register(
                "gguf_llm",
                llm.is_loaded,
                lambda: llm.unload_model(),
            )
        except Exception:
            logger.debug("LLM backend not registered (no model available)")

        try:
            rvc_backend = get_vc_backend("rvc")
            lifecycle_manager.register("rvc", rvc_backend.is_loaded, lambda: rvc_backend.unload_model())
        except Exception:
            logger.debug("RVC backend not registered (no model available)")

        try:
            seed_vc_backend = get_vc_backend("seed_vc")
            lifecycle_manager.register(
                "seed_vc",
                seed_vc_backend.is_loaded,
                lambda: seed_vc_backend.unload_model(),
            )
        except Exception:
            logger.debug("Seed-VC backend not registered (no model available)")

        try:
            from .backends.stable_audio_backend import stable_audio_backend
            lifecycle_manager.register(
                "stable_audio",
                stable_audio_backend.is_loaded,
                lambda: stable_audio_backend.unload_model(),
            )
        except Exception:
            logger.debug("Stable Audio backend not registered (no model available)")

        # DeepFilter loads lazily on the first neural-cleanup use and must NOT
        # stay resident: register it (not always-on) so the idle scheduler
        # unloads it after cleanup, and so it never loads when cleanup isn't
        # requested.
        try:
            from .services.deepfilter_onnx import _is_session_loaded, unload_deepfilter
            lifecycle_manager.register("deepfilter", _is_session_loaded, unload_deepfilter)
        except Exception:
            logger.debug("DeepFilter not registered (no model available)")

    async def _bg_register_engines_and_signal_ready() -> None:
        try:
            _register_lifecycle_engines()
            lifecycle_manager.start()
        except Exception as e:
            logger.warning("Could not start model lifecycle scheduler: %s", e)
        # Signal readiness after lifecycle registration — the server
        # can now route requests to backends. Model preloading (Kokoro,
        # planner LLM) happens lazily in background and doesn't block
        # acceptance of generation requests.
        _signal_ready()

    create_background_task(_bg_register_engines_and_signal_ready())
    try:
        progress_manager = get_progress_manager()
        progress_manager._set_main_loop(asyncio.get_running_loop())
    except Exception as e:
        logger.warning("Could not initialize progress manager event loop: %s", e)

    try:
        from huggingface_hub import constants as hf_constants

        cache_dir = Path(hf_constants.HF_HUB_CACHE)
        cache_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Model cache: %s", cache_dir)
    except Exception as e:
        logger.warning("Could not create HuggingFace cache directory: %s", e)

    # Warm-start preload for the cached Kokoro ONNX engine so first
    # generation has zero cold-start delay.  No-default-model policy: this
    # only runs when the user already has Kokoro cached AND preload is
    # enabled in generation settings — it never triggers a download.
    async def _bg_preload_kokoro() -> None:
        try:
            from .services.settings import get_generation_settings

            db_gen = next(get_db())
            try:
                if not get_generation_settings(db_gen).preload_on_start:
                    logger.info("Engine preload disabled in settings; skipping")
                    return
            finally:
                db_gen.close()

            from .backends.kokoro_onnx_backend import KokoroONNXBackend, is_onnx_available

            if is_onnx_available():
                _kokoro = KokoroONNXBackend()
                if _kokoro._is_model_cached():
                    await _kokoro.load_model()
                    logger.info("Kokoro ONNX preloaded (cached engine)")
                else:
                    logger.info("Kokoro ONNX not cached; will download on first use")
        except Exception as e:
            logger.debug("Kokoro ONNX preload skipped: %s", e)

    create_background_task(_bg_preload_kokoro())

    # Pre-warm the planner LLM at user entry so the assistant is ready on first
    # use. Background + non-blocking: if the GGUF isn't cached yet it downloads
    # in the background and the first assistant call waits via the 202 path.
    async def _bg_preload_planner() -> None:
        try:
            from .backends import get_llm_backend_for_engine

            backend = get_llm_backend_for_engine("gguf_llm")
            # Mirror the Kokoro preload (no-default-model policy): only warm if
            # the planner GGUF is already cached. Never trigger a multi-GB
            # download at startup — the first assistant use downloads via the
            # 202 path instead.
            if not backend._is_model_cached(backend.model_size):
                logger.info("Planner GGUF not cached; will load on first assistant use")
                return
            await backend.load_model()
            logger.info("Planner LLM pre-warmed")
        except Exception as e:
            logger.debug("Planner preload skipped: %s", e)

    create_background_task(_bg_preload_planner())

    # Auto-spawn voice-changer if enabled in settings
    try:
        from .services.memory import get_voice_chat_settings

        vc_settings = get_voice_chat_settings()
        if vc_settings.get("voice_changer_enabled"):
            from .voice_changer import spawn_voice_changer

            vc_port = vc_settings.get("voice_changer_port", 17494)
            spawn_voice_changer(port=vc_port)
    except Exception as e:
        logger.debug("Voice-changer auto-spawn skipped: %s", e)

    logger.info(
        "Startup complete — 71 routers, DB ready, lifecycle registered. "
        "Background tasks (GPU probe, STT check, model preload) running async."
    )


async def _run_shutdown() -> None:
    """Unload models on lifespan exit."""
    logger.info("otoyin server shutting down...")

    # Kill voice-changer subprocess if running
    try:
        from .voice_changer import _vc_process

        if _vc_process and _vc_process.poll() is None:
            logger.info("Stopping voice-changer service (pid=%d)", _vc_process.pid)
            _vc_process.terminate()
            try:
                _vc_process.wait(timeout=5)
            except Exception:
                _vc_process.kill()
    except Exception:
        logger.debug("Voice-changer shutdown skipped (not running)", exc_info=True)

    try:
        from .utils.model_lifecycle import lifecycle_manager

        await lifecycle_manager.stop()
    except Exception:
        logger.exception("Failed to stop model lifecycle scheduler")
    from .services import llm as _llm, transcribe as _transcribe, tts as _tts

    try:
        _tts.unload_tts_model()
    except Exception:
        logger.exception("Failed to unload TTS model")
    try:
        _transcribe.unload_whisper_model()
    except Exception:
        logger.exception("Failed to unload Whisper model")
    try:
        _llm.unload_llm_model()
    except Exception:
        logger.exception("Failed to unload LLM model")


# ---------------------------------------------------------------------------
# Cross-platform graceful shutdown
# ---------------------------------------------------------------------------
# On Unix, SIGTERM triggers uvicorn's built-in shutdown → lifespan →
# _run_shutdown(). On Windows, uvicorn does NOT register a SIGTERM handler,
# so the watchdog thread uses these helpers to trigger the same path.
#
# Flow on signal:
#   signal handler → _run_shutdown() → models unloaded → sys.exit(0)
#
# Flow from watchdog thread:
#   watchdog → graceful_exit() → signal → same path as above

import signal as _signal
import threading as _threading

_uvicorn_server = None


def _set_uvicorn_server(srv):
    global _uvicorn_server
    _uvicorn_server = srv


def _get_uvicorn_server():
    return _uvicorn_server


_shutdown_event = _threading.Event()

# ── Readiness gate ───────────────────────────────────────────────────────
# Holds incoming requests (except /health*) until background init completes.
# Set by _signal_ready() after GPU checks, lifecycle registration, etc.
_ready_event: asyncio.Event | None = None

# Startup failure tracking: set when a critical init step fails so the
# /health/ready endpoint can report what went wrong instead of saying
# "initializing" forever.
_startup_error: str | None = None


def _init_ready_event() -> None:
    global _ready_event, _startup_error
    _ready_event = asyncio.Event()
    _startup_error = None


def _signal_ready() -> None:
    if _ready_event is not None and not _ready_event.is_set():
        _ready_event.set()
        logger.info("Server ready — requests now accepted")


def _signal_startup_error(error: str) -> None:
    """Record a fatal startup error and signal readiness so the health
    endpoint can report the error instead of hanging at 503 forever."""
    global _startup_error
    _startup_error = error
    logger.error("Startup failed: %s", error)
    # Also signal ready so requests stop getting 503 — the error will
    # be visible in /health/ready status.
    _signal_ready()


def _is_ready() -> bool:
    return _ready_event is not None and _ready_event.is_set()


def _get_startup_error() -> str | None:
    return _startup_error


def _install_signal_handlers():
    """Install SIGTERM / SIGINT / SIGBREAK handlers for graceful shutdown.

    On Unix, uvicorn registers its own SIGTERM handler that shuts down the
    ASGI lifespan.  We install our handler *after* uvicorn so it layers on
    top: our handler calls _run_shutdown() and then sys.exit(0).

    On Windows, uvicorn does NOT register SIGTERM, so we own it entirely.
    SIGBREAK (Ctrl+Break /TerminateProcess) is also handled.

    Safe to call multiple times (idempotent).
    """

    def _handler(signum, frame):
        if _shutdown_event.is_set():
            return  # already shutting down
        # When running under `uvicorn --reload`, WatchFiles sends SIGINT to
        # trigger a hot-reload. That SIGINT must NOT become a hard sys.exit(0)
        # or the reloader process itself exits and `just dev` dies with
        # "Terminate batch job (Y/N)?". Detect reload mode and delegate to
        # uvicorn's own reloader instead.
        is_reload = "--reload" in sys.argv
        if is_reload and signum in (_signal.SIGINT, getattr(_signal, "SIGBREAK", _signal.SIGINT)):
            logger.info("Received %s in --reload mode — delegating to uvicorn reloader", _signal.Signals(signum).name)
            # Restore default so uvicorn's reloader can restart the worker.
            with suppress(Exception):
                _signal.signal(signum, _signal.SIG_DFL)
            # Don't call _run_shutdown here — the lifespan's
            # `finally: await _run_shutdown()` will run on worker exit.
            # Re-raise as KeyboardInterrupt so the reloader sees it.
            raise KeyboardInterrupt
        _shutdown_event.set()
        sign_name = _signal.Signals(signum).name
        logger.info("Received %s — initiating graceful shutdown", sign_name)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None and loop.is_running():
            # We're inside uvicorn's running loop (Ctrl+C without --reload).
            with suppress(Exception):
                loop.call_soon_threadsafe(_signal.signal, signum, _signal.SIG_DFL)
            try:
                future = asyncio.run_coroutine_threadsafe(_run_shutdown(), loop)

                def _exit_after(_f):
                    with suppress(Exception):
                        sys.exit(0)

                future.add_done_callback(_exit_after)
                return
            except RuntimeError:
                pass  # fallback to direct run below
            with suppress(Exception):
                loop.call_soon_threadsafe(lambda: None)
            return
        # No running loop (atexit / __main__ / test) — run shutdown synchronously
        with suppress(RuntimeError):
            asyncio.run(_run_shutdown())
        sys.exit(0)

    for sig in (_signal.SIGTERM, _signal.SIGINT):
        with suppress(OSError, ValueError):
            _signal.signal(sig, _handler)
    if sys.platform == "win32":
        with suppress(OSError, ValueError):
            _signal.signal(_signal.SIGBREAK, _handler)


def graceful_exit():
    """Trigger graceful shutdown from any thread (cross-platform).

    On Unix, sends SIGTERM to self which triggers the signal handler above.
    On Windows, asks uvicorn's main loop to exit via ``should_exit``; its
    lifespan shutdown then runs ``_run_shutdown()`` (model unload, DB,
    scheduler stop) before the process terminates.

    This replaces the old os._exit(0) on Windows which killed the process
    without running cleanup handlers (model unload, DB commit, etc.).
    """
    if _shutdown_event.is_set():
        return
    _shutdown_event.set()

    if sys.platform != "win32":
        # Unix: send SIGTERM to self → signal handler runs in main thread
        try:
            os.kill(os.getpid(), _signal.SIGTERM)
        except OSError:
            # Fallback: run shutdown from this thread
            with suppress(RuntimeError):
                asyncio.get_event_loop().run_until_complete(_run_shutdown())
            sys.exit(0)
    else:
        # Windows: os.kill(SIGTERM) is a no-op and CTRL_C_EVENT targets the
        # whole console (it would hit the parent too). Instead, ask
        # uvicorn's main loop to exit via ``should_exit`` — its ASGI
        # lifespan shutdown runs ``_run_shutdown()`` (model unload, DB,
        # scheduler stop) before the process terminates.
        #
        # This works from ANY thread: request-handler threads and the
        # parent watchdog have no asyncio event loop, so
        # ``asyncio.get_event_loop()`` would raise there and the old code
        # silently fell into the exception handler, leaving the process
        # alive (broken /shutdown and watchdog shutdown).
        if _uvicorn_server is not None:
            _uvicorn_server.should_exit = True
            return
        # No uvicorn.Server reference (app embedded elsewhere): run the
        # shutdown coroutine on a fresh loop as a last resort.
        try:
            asyncio.run(_run_shutdown())
        except Exception:
            logger.debug("Graceful exit fallback failed", exc_info=True)
        sys.exit(0)


app = create_app()
