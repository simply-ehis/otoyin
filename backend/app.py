"""FastAPI application factory, middleware, and lifecycle events."""

import asyncio
import logging
import os
import sys
from contextlib import AsyncExitStack, asynccontextmanager, suppress
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


# BUG-018 (Windows): a cp1252 stderr/stdout cannot encode non-ASCII paths
# (e.g. a directory named 汉字.wav). Keep the console encoding but never raise
# on unencodable chars — log them as \\uXXXX escapes instead.
for _stream in (sys.stderr, sys.stdout):
    try:
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(errors="backslashreplace")
    except Exception:  # pragma: no cover - stream that cannot reconfigure
        pass

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
from .fatal_handlers import install_fatal_handlers
from .routes import register_routers
from .services.task_queue import create_background_task, init_queue
from .utils.platform_detect import get_backend_type
from .utils.progress import get_progress_manager

# Process-level safety net (faulthandler + exception hooks) for every entry
# point that imports this module: frozen server.py, uvicorn backend.main:app.
install_fatal_handlers()


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
    # build it lazily on first /mcp request via MCPLazyBuildMiddleware.

    @asynccontextmanager
    async def otoyin_lifespan(app: FastAPI):
        _init_ready_event()

        try:
            await _run_startup(app)
            async with AsyncExitStack() as mcp_lifespan_stack:
                app.state.mcp_lifespan_stack = mcp_lifespan_stack
                yield
        finally:
            app.state.mcp_lifespan_stack = None
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

    health_paths = ("/health", "/health/ready", "/health/filesystem")

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

    # Request-ID + access log: every response carries X-Request-ID so a
    # frontend console error can be correlated with one backend log line.
    # Failures are logged with exc_info (production-grade triage) instead of
    # vanishing into "backend died midway" silence.
    import time as _time
    import uuid as _uuid

    import starlette.requests as _requests

    class RequestIdMiddleware(starlette.middleware.base.BaseHTTPMiddleware):
        async def dispatch(self, request: _requests.Request, call_next):
            rid = request.headers.get("X-Request-ID") or _uuid.uuid4().hex[:12]
            start = _time.monotonic()
            try:
                response = await call_next(request)
            except Exception:
                logger.exception("request %s %s failed (rid=%s)", request.method, request.url.path, rid)
                raise
            elapsed_ms = (_time.monotonic() - start) * 1000
            response.headers["X-Request-ID"] = rid
            # Slow-request line: the "backend dying midway" reports were
            # almost always a >30s model load blocking the loop.
            if elapsed_ms > 5000:
                logger.warning(
                    "slow request %s %s took %.0fms (rid=%s)",
                    request.method,
                    request.url.path,
                    elapsed_ms,
                    rid,
                )
            return response

    application.add_middleware(RequestIdMiddleware)

    # Crash capture: observes unhandled exceptions into the opt-in crash
    # log and re-raises, so error responses are unchanged. Outermost so it
    # also sees failures from the middleware above.
    from .routes.crashes import CrashCaptureMiddleware

    application.add_middleware(CrashCaptureMiddleware)

    from .backends.base import ModelNotCachedError

    @application.exception_handler(ModelNotCachedError)
    async def model_not_cached_handler(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"detail": "Model not cached"})

    from .config import PathTraversalError

    @application.exception_handler(PathTraversalError)
    async def path_traversal_handler(request, exc):
        """Bad client path — a 400, not a 500 with a crash-report entry."""
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc):
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        # NOTE: @exception_handler converts to a response INSIDE the app, so
        # CrashCaptureMiddleware never sees this exception — capture here.
        # Local-only store; never raises out of the error path.
        try:
            from .services import crash_reports as _crash_reports

            _crash_reports.capture_exception(
                exc,
                context={"path": request.url.path, "method": request.method},
            )
        except Exception:
            logger.debug("suppressed exception in app.py:248", exc_info=True)
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    register_routers(application)

    # ── Lazy MCP mount ──────────────────────────────────────────────
    # MCP server + tool registration costs ~5 s of import time.
    # Instead of building at startup, we build on the first /mcp request
    # via a middleware that mounts the sub-app on demand.
    _mcp_app_holder: dict[str, object] = {}

    class MCPLazyBuildMiddleware:
        """Build and mount the MCP sub-app on first /mcp request."""

        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if scope["type"] != "http":
                await self.app(scope, receive, send)
                return
            path = scope.get("path", "")
            if (path == "/mcp" or path.startswith("/mcp/")) and "app" not in _mcp_app_holder:
                from .utils.startup_defer import ensure_mcp_built

                await ensure_mcp_built(application)
            await self.app(scope, receive, send)

    application.add_middleware(MCPLazyBuildMiddleware)

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
                logger.debug("suppressed exception in app.py:408", exc_info=True)
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
        logger.debug("suppressed exception in app.py:447", exc_info=True)
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

    # -- Signal readiness -------------------------------------------------
    # Core is instant: DB + queue + worker. Everything else rolls out in
    # staged background tiers so the app is usable immediately.
    _signal_ready()

    # Tier 1 (+2 s): warm the health snapshot (torch/CUDA init, ~5.9 s cold).
    # Runs in a thread because every probe inside is blocking.
    async def _tier1_health_warm() -> None:
        await asyncio.sleep(2.0)
        try:
            import time as _time

            warm_t0 = _time.perf_counter()
            await asyncio.to_thread(_warm_health_snapshot)
            logger.info("Health snapshot warmed in %.0f ms", (_time.perf_counter() - warm_t0) * 1000)
        except Exception as e:
            logger.warning("Health snapshot warm-up skipped: %s", e, exc_info=True)

    create_background_task(_tier1_health_warm())

    # Tier 2 (+4 s): stale-state cleanup (file scan over the data dir).
    async def _tier2_cleanup() -> None:
        await asyncio.sleep(4.0)
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

    create_background_task(_tier2_cleanup())

    # Tier 3 (+6 s): preload models with preload_priority > 0 (Kokoro ONNX,
    # Moonshine STT, etc.). Runs in background so the app is usable immediately.
    async def _tier3_model_preload() -> None:
        await asyncio.sleep(6.0)
        from .utils.startup_defer import ensure_models_preloaded

        await ensure_models_preloaded()

    create_background_task(_tier3_model_preload())

    from .utils.platform_detect import log_platform_info

    log_platform_info()
    # Install cross-platform signal handlers for graceful shutdown.
    # On Unix, SIGTERM already triggers uvicorn's shutdown; our handler
    # layers on top to also call _run_shutdown() and sys.exit(0).
    # On Windows, uvicorn doesn't handle SIGTERM, so we own it entirely.
    _install_signal_handlers()

    try:
        from huggingface_hub import constants as hf_constants

        cache_dir = Path(hf_constants.HF_HUB_CACHE)
        cache_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Model cache: %s", cache_dir)
    except Exception as e:
        logger.warning("Could not create HuggingFace cache directory: %s", e)

    try:
        progress_manager = get_progress_manager()
        progress_manager._set_main_loop(asyncio.get_running_loop())
    except Exception as e:
        logger.warning("Could not initialize progress manager event loop: %s", e)

    # Voice-changer is NOT spawned at boot - it starts on first use via
    # voice_chat.py's ensure_vc_spawned() call.

    from .utils.memory import available_mb, get_system_total_mb

    free_mb = available_mb()
    total_mb = get_system_total_mb()
    logger.info(
        "Startup complete — %d routers, DB ready. "
        "Engine registration, MCP, and preloads deferred to first use. "
        "Memory: %dMB free / %dMB total",
        71,
        free_mb,
        total_mb,
    )
    if free_mb > 0 and free_mb < 512:
        logger.warning(
            "LOW MEMORY at startup: %dMB free — model loads may be skipped to avoid OOM kill",
            free_mb,
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
                logger.debug("suppressed exception in app.py:569", exc_info=True)
                _vc_process.kill()
    except Exception:
        logger.debug("Voice-changer shutdown skipped (not running)", exc_info=True)

    # Kill plugin subprocesses
    try:
        from .services.plugin_install import stop_all_plugins

        stop_all_plugins()
    except Exception:
        logger.debug("Plugin shutdown skipped", exc_info=True)

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

    # Stop the download executor so a mid-download shutdown does not hang
    # the loop (or strand a partial HF cache that later looks "installed").
    try:
        from .routes.models.common import _download_executor

        _download_executor.shutdown(wait=False, cancel_futures=True)
    except Exception:
        logger.debug("Download executor shutdown skipped", exc_info=True)


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


def _warm_health_snapshot() -> None:
    """Populate the cached GPU snapshot and TTS engine registry before readiness.

    ``GET /health`` probes the GPU (torch/CUDA initialisation) and scans the TTS
    engine registry. Cold, that is ~5.9 s of blocking work. Left lazy, the first
    client request paid it inline and froze the event loop, so the app looked
    hung immediately after launch. Calling this once during startup moves the
    cost into the background start-up window, where it belongs.

    Safe to fail: a warm-up error must never block readiness.
    """
    from .routes.health import _build_health_response

    _build_health_response()


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
