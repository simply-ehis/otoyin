"""Health and infrastructure endpoints."""

import asyncio
import logging
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import config, models
from ..services import tts
from ..utils.hidden_subprocess import popen_hidden, run_hidden
from ..utils.platform_detect import get_backend_type

logger = logging.getLogger(__name__)

router = APIRouter()


def _require_localhost(request: Request) -> None:
    """Guard for management endpoints: only allow connections from loopback.

    In remote mode the RemoteAuthMiddleware handles auth. This covers the
    local-only case where there's no auth middleware at all.
    """
    client = request.client
    if client is None:
        return  # internal/test calls (e.g. TestClient)
    host = client.host
    # Bracket-stripped IPv6 loopback and hostname forms all normalize to a
    # loopback check so proxies can't sneak past by sending "::ffff:127.0.0.1".
    try:
        import ipaddress

        if ipaddress.ip_address(host.strip("[]")).is_loopback:
            return
    except ValueError:
        pass
    from fastapi import HTTPException

    raise HTTPException(status_code=403, detail="Management endpoints are localhost-only")


# ── GPU Health Snapshot ──────────────────────────────────────────────────
# GPU hardware info (availability, type, compatibility) is invariant after
# startup.  Probe once on first /health call (or via _populate_gpu_snapshot)
# and cache the result.  Dynamic fields (vram_used_mb, model_loaded, etc.)
# are still computed per-request.
#
_gpu_snapshot_lock = threading.Lock()
_gpu_snapshot: dict | None = None


def _populate_gpu_snapshot() -> dict:
    """Probe GPU hardware once and return a dict of invariant fields."""
    try:
        import torch

        has_cuda = torch.cuda.is_available()
        has_mps = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    except ImportError:
        torch = None  # type: ignore[assignment]
        has_cuda = False
        has_mps = False

    has_xpu = False
    xpu_name = None
    try:
        import intel_extension_for_pytorch as ipex

        if torch is not None and hasattr(torch, "xpu") and torch.xpu.is_available():
            has_xpu = True
            try:
                xpu_name = torch.xpu.get_device_name(0)
            except Exception as e:
                logger.debug("XPU name detection failed: %s", e)
                xpu_name = "Intel GPU"
    except ImportError:
        pass

    has_directml = False
    directml_name = None
    try:
        import torch_directml

        if torch_directml.device_count() > 0:
            has_directml = True
            try:
                directml_name = torch_directml.device_name(0)
            except Exception as e:
                logger.debug("DirectML name detection failed: %s", e)
                directml_name = "DirectML GPU"
    except ImportError:
        pass

    gpu_compat_warning = None
    if has_cuda:
        from ..backends.base import check_cuda_compatibility

        _compatible, gpu_compat_warning = check_cuda_compatibility()

    gpu_available = has_cuda or has_mps or has_xpu or has_directml

    gpu_type = None
    if has_cuda and torch is not None:
        gpu_type = f"CUDA ({torch.cuda.get_device_name(0)})"
    elif has_mps:
        gpu_type = "MPS (Apple Silicon)"
    elif has_xpu:
        gpu_type = f"XPU ({xpu_name})"
    elif has_directml:
        gpu_type = f"DirectML ({directml_name})"

    backend_variant = os.environ.get(
        "TWENTYLABS_BACKEND_VARIANT",
        "cuda" if (torch is not None and torch.cuda.is_available()) else ("xpu" if has_xpu else "cpu"),
    )

    return {
        "gpu_available": gpu_available,
        "gpu_type": gpu_type,
        "gpu_compatibility_warning": gpu_compat_warning,
        "backend_type": get_backend_type(),
        "backend_variant": backend_variant,
    }


def _get_gpu_snapshot() -> dict:
    """Return the cached GPU snapshot, populating it on first call.

    Thread-safe via double-checked locking.  If the GPU probe itself
    raises, we cache a safe fallback so subsequent calls don't re-probe.
    """
    global _gpu_snapshot
    if _gpu_snapshot is not None:
        return _gpu_snapshot
    with _gpu_snapshot_lock:
        if _gpu_snapshot is not None:
            return _gpu_snapshot
        logger.info("Probing GPU hardware (first /health call)")
        try:
            _gpu_snapshot = _populate_gpu_snapshot()
        except Exception:
            logger.exception("GPU snapshot probe failed; using safe defaults")
            _gpu_snapshot = {
                "gpu_available": False,
                "gpu_type": None,
                "gpu_compatibility_warning": None,
                "backend_type": "unknown",
                "backend_variant": "cpu",
            }
        logger.info("GPU snapshot: %s", _gpu_snapshot.get("gpu_type") or "CPU only")
        return _gpu_snapshot


def reset_gpu_snapshot() -> None:
    """Reset the cached GPU snapshot (for testing only)."""
    global _gpu_snapshot
    with _gpu_snapshot_lock:
        _gpu_snapshot = None


# Frontend build directory — present in Docker, absent in dev/API-only mode
_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"


def _probe_subsystems() -> list[models.HealthSubsystem]:
    """Check the health of key subsystems for the /health response."""
    subsystems: list[models.HealthSubsystem] = []

    # Task queue depth
    try:
        from ..services.task_queue import _queued_generation_ids

        depth = len(_queued_generation_ids) if _queued_generation_ids else 0
        healthy = depth < 50
        detail = f"{depth} queued" if depth > 0 else "idle"
        subsystems.append(models.HealthSubsystem(name="task_queue", healthy=healthy, detail=detail))
    except Exception as e:
        subsystems.append(models.HealthSubsystem(name="task_queue", healthy=False, detail=str(e)[:120]))

    # Lifecycle manager state
    try:
        from ..utils.model_lifecycle import lifecycle_manager

        loaded = [eng for eng, h in lifecycle_manager._engines.items() if h.is_loaded()]
        detail = f"{len(loaded)} engines loaded" if loaded else "no engines loaded"
        subsystems.append(models.HealthSubsystem(name="lifecycle", healthy=True, detail=detail))
    except Exception as e:
        subsystems.append(models.HealthSubsystem(name="lifecycle", healthy=False, detail=str(e)[:120]))

    # Database connectivity
    try:
        from sqlalchemy import text

        from ..database.session import engine as db_engine

        if db_engine is None:
            subsystems.append(models.HealthSubsystem(name="database", healthy=False, detail="not initialized"))
        else:
            with db_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            subsystems.append(models.HealthSubsystem(name="database", healthy=True, detail="connected"))
    except Exception as e:
        subsystems.append(models.HealthSubsystem(name="database", healthy=False, detail=str(e)[:120]))

    return subsystems


@router.get("/")
async def root():
    """Root endpoint — serves SPA index.html in Docker, JSON otherwise."""
    from .. import __version__

    index = _frontend_dir / "index.html"
    if index.is_file():
        return FileResponse(index, media_type="text/html")
    return {"message": "otoyin API", "version": __version__}


@router.post("/watchdog/disable")
async def watchdog_disable(request: Request):
    """Disable the parent process watchdog so the server keeps running. Localhost-only."""
    _require_localhost(request)

    from backend.server import disable_watchdog

    disable_watchdog()
    return {"message": "Watchdog disabled"}


@router.get("/health/live")
async def health_live():
    """Liveness probe — lightweight endpoint for the process supervisor.

    Returns 200 if the process is alive and the event loop is responsive.
    No DB queries, no GPU probes, no imports — just a dict response.
    The supervisor polls this every 5s to detect hangs.
    """
    return {"alive": True, "pid": os.getpid()}


@router.get("/health/ready")
async def health_ready():
    """Readiness probe — returns 200 when the server can accept traffic,
    503 while background initialization (GPU checks, lifecycle registration,
    model preload) is still running.

    The frontend should poll this endpoint during bootstrap; all other
    endpoints return 503 with Retry-After until readiness is signaled.

    If startup failed (e.g. corrupt database, missing dependency), the
    response includes an ``error`` field with the failure reason so the
    frontend can display a meaningful message instead of "initializing".
    """
    from ..app import _get_startup_error, _is_ready

    ready = _is_ready()
    error = _get_startup_error()
    if error:
        return {"ready": False, "status": "startup_failed", "error": error}
    return {"ready": ready, "status": "ok" if ready else "initializing"}


@router.post("/shutdown")
async def shutdown(request: Request):
    """Trigger a graceful server shutdown (localhost-only).

    Calls the same ``graceful_exit()`` path that the watchdog uses:
    ``_run_shutdown()`` → models unloaded → ``sys.exit(0)``.
    Works on Windows where SIGTERM is unreliable.
    """
    _require_localhost(request)

    from ..app import graceful_exit

    # Schedule graceful_exit in a separate thread so we can return
    # a 200 response before the process exits.
    threading.Thread(target=graceful_exit, daemon=True).start()
    return {"detail": "Shutting down"}


@router.get("/health", response_model=models.HealthResponse)
async def health():
    """Health check endpoint.

    Invariant GPU info (availability, type, compatibility) is probed once
    and cached in _gpu_snapshot.  Dynamic fields (VRAM, model state) are
    computed per-request.

    The probes are blocking (lazy torch import, engine-registry scan, model
    directory walk, psutil), so the whole snapshot is built in a worker
    thread.  Running it inline froze the entire event loop for ~10 s on the
    first call after startup — the UI appeared to hang right after launch,
    and ``test_graceful_shutdown_unloads_models_and_exits_cleanly`` timed out
    polling /health.  Steady-state cost is ~35 ms; thread offload keeps the
    loop responsive for the cold path too.
    """
    return await asyncio.to_thread(_build_health_response)


def _build_health_response() -> models.HealthResponse:
    """Blocking part of ``GET /health``. Runs in a worker thread."""
    # ── Invariant fields (cached) ──
    snap = _get_gpu_snapshot()

    # ── Dynamic VRAM fields (per-request) ──
    try:
        from ..utils.vram_pressure import get_vram_status

        vram = get_vram_status()
        vram_used = vram.used_mb if vram.available else None
        vram_total = vram.total_mb if vram.available else None
        vram_free = vram.free_mb if vram.available else None
        vram_pressure = vram.pressure
    except Exception as e:
        logger.debug("VRAM pressure probe failed: %s", e)
        vram_used = vram_total = vram_free = None
        vram_pressure = None

    # ── Model state (per-request) ──
    # A missing TTS engine is a normal fresh-install state, not a 500:
    # report "no model" and let the frontend route to the Store instead.
    try:
        tts_model = tts.get_tts_model()
    except Exception as e:
        logger.debug("No TTS engine installed yet: %s", e)
        tts_model = None

    model_loaded = False
    model_size = None
    try:
        if tts_model is not None and tts_model.is_loaded():
            model_loaded = True
            model_size = getattr(tts_model, "_current_model_size", None)
            if not model_size:
                model_size = getattr(tts_model, "model_size", None)
    except Exception as e:
        logger.debug("Model load check failed: %s", e)

    model_downloaded = None
    try:
        from ..utils.model_status import pick_cached_tts_engine

        model_downloaded = pick_cached_tts_engine() is not None
    except Exception as e:
        logger.debug("Model download check failed: %s", e)

    # ── Subsystem health ──
    subsystems = _probe_subsystems()

    # ── System RAM ──
    try:
        from ..utils.memory import available_mb, get_system_total_mb

        ram_total = get_system_total_mb()
        ram_free = available_mb()
    except Exception:
        ram_total = ram_free = None

    return models.HealthResponse(
        status="healthy",
        model_loaded=model_loaded,
        model_downloaded=model_downloaded,
        model_size=model_size,
        gpu_available=snap["gpu_available"],
        gpu_type=snap["gpu_type"],
        vram_used_mb=vram_used,
        vram_total_mb=vram_total,
        vram_free_mb=vram_free,
        vram_pressure=vram_pressure,
        ram_total_mb=ram_total,
        ram_free_mb=ram_free,
        backend_type=snap["backend_type"],
        backend_variant=snap["backend_variant"],
        gpu_compatibility_warning=snap["gpu_compatibility_warning"],
        subsystems=subsystems,
    )


@router.get("/health/filesystem", response_model=models.FilesystemHealthResponse)
async def filesystem_health():
    """Check filesystem health: directory existence, write permissions, and disk space."""
    import shutil

    dirs_to_check = {
        "generations": config.get_generations_dir(),
        "captures": config.get_captures_dir(),
        "profiles": config.get_profiles_dir(),
        "data": config.get_data_dir(),
    }

    checks: list[models.DirectoryCheck] = []
    all_ok = True

    for _label, dir_path in dirs_to_check.items():
        exists = dir_path.exists()
        writable = False
        error = None
        if exists:
            probe = dir_path / ".21labs_probe"
            try:
                probe.write_text("ok")
                probe.unlink()
                writable = True
            except PermissionError:
                error = "Permission denied"
            except OSError as e:
                error = str(e)
            finally:
                try:
                    probe.unlink(missing_ok=True)
                except Exception as e:
                    logger.debug("Failed to clean up probe file: %s", e)
        else:
            error = "Directory does not exist"

        if not exists or not writable:
            all_ok = False

        checks.append(
            models.DirectoryCheck(
                path=str(dir_path.resolve()),
                exists=exists,
                writable=writable,
                error=error,
            )
        )

    disk_free_mb = None
    disk_total_mb = None
    try:
        usage = shutil.disk_usage(str(config.get_data_dir()))
        disk_free_mb = round(usage.free / (1024 * 1024), 1)
        disk_total_mb = round(usage.total / (1024 * 1024), 1)
        if disk_free_mb < 500:
            all_ok = False
    except OSError:
        all_ok = False

    return models.FilesystemHealthResponse(
        healthy=all_ok,
        disk_free_mb=disk_free_mb,
        disk_total_mb=disk_total_mb,
        directories=checks,
    )


class ModelHealth(BaseModel):
    """Lightweight model download status for health checks."""

    name: str
    downloaded: bool
    loaded: bool = False


class EngineHealth(BaseModel):
    """Per-engine lifecycle dump for the health dashboard."""

    engine: str
    is_loaded: bool
    last_used: float | None = None
    last_used_ago: float | None = None
    always_on: bool = False
    per_engine_keepalive: bool | None = None
    gpu_only: bool = False
    needs_trim: bool = False


# ── /health/check cache (60s) ────────────────────────────────────────────
_health_check_cache: dict | None = None
_health_check_at: float = 0.0
_health_check_lock = threading.Lock()


@router.get("/health/models")
async def health_models():
    """Per-engine lifecycle dump for the model health dashboard.

    Returns ``lifecycle_manager._engines`` state for the 16 TTS engines so the
    frontend can render loaded/last-used/keepalive without polling
    ``/models/status``. Falls back to ``TTS_ENGINES`` when the manager hasn't
    registered an engine yet (cold start) so the count is stable.
    """
    from ..backends.configs import get_all_model_configs
    from ..backends.protocols import TTS_ENGINES
    from ..services.always_on import is_engine_always_on
    from ..utils.model_lifecycle import lifecycle_manager

    # Aggregate gpu_only / needs_trim per engine from the full config list
    flags: dict[str, dict[str, bool]] = {}
    for cfg in get_all_model_configs():
        cur = flags.setdefault(cfg.engine, {"gpu_only": False, "needs_trim": False})
        if cfg.gpu_only:
            cur["gpu_only"] = True
        if cfg.needs_trim:
            cur["needs_trim"] = True

    now_mono = time.monotonic()
    now_wall = time.time()
    per_keep = getattr(lifecycle_manager, "_per_engine_keepalive", {}) or {}

    engines: list[dict] = []
    for engine in sorted(TTS_ENGINES.keys()):
        handle = lifecycle_manager._engines.get(engine)
        if handle is not None:
            try:
                is_loaded = bool(handle.is_loaded())
            except Exception:
                is_loaded = False
            try:
                always_on = bool(handle.always_on)
            except Exception:
                always_on = False
            last_used_mono = getattr(handle, "last_used", None)
            if isinstance(last_used_mono, (int, float)):
                last_used_wall = now_wall - (now_mono - last_used_mono)
                last_used_ago = now_mono - last_used_mono
            else:
                last_used_wall = None
                last_used_ago = None
        else:
            is_loaded = False
            last_used_wall = None
            last_used_ago = None
            try:
                always_on = bool(is_engine_always_on(engine))
            except Exception:
                always_on = False

        per_engine_keepalive = per_keep.get(engine) if isinstance(per_keep, dict) else None
        flag = flags.get(engine, {"gpu_only": False, "needs_trim": False})
        engines.append(
            {
                "engine": engine,
                "is_loaded": is_loaded,
                "last_used": last_used_wall,
                "last_used_ago": last_used_ago,
                "always_on": always_on,
                "per_engine_keepalive": per_engine_keepalive,
                "gpu_only": bool(flag["gpu_only"]),
                "needs_trim": bool(flag["needs_trim"]),
            }
        )

    # Keep legacy ``models`` key for backward compat — callers that expect
    # ModelHealth still work, but the dashboard prefers ``engines``.
    legacy_models: list[dict] = []
    try:
        from ..backends import check_model_loaded, get_all_model_configs
        from ..utils.model_status import is_model_downloaded

        cfgs = get_all_model_configs()
        for cfg in cfgs:
            try:
                downloaded = bool(is_model_downloaded(cfg.model_name))
            except Exception as e:
                logger.debug("Model download check failed for %s: %s", cfg.model_name, e)
                downloaded = False
            try:
                loaded = bool(check_model_loaded(cfg))
            except Exception as e:
                logger.debug("Model load check failed for %s: %s", cfg.model_name, e)
                loaded = False
            legacy_models.append({"name": cfg.model_name, "downloaded": downloaded, "loaded": loaded})
    except Exception as e:
        logger.debug("Legacy models dump failed: %s", e)

    return {"engines": engines, "models": legacy_models}


@router.get("/health/check")
async def health_check():
    """Gate status for the Model Health dashboard — cached 60s, 5s per-check timeout.

    Runs ``check_name_map`` + ``check_placeholders`` + ``biome --version``
    (plus ruff/tsc probes) and returns a cached result so the dashboard
    doesn't hang on a slow scan.
    """
    global _health_check_cache, _health_check_at

    now = time.monotonic()
    with _health_check_lock:
        if _health_check_cache is not None and (now - _health_check_at) < 60:
            return _health_check_cache

    async def _with_timeout(coro, timeout: float = 5.0):
        try:
            return await asyncio.wait_for(coro, timeout=timeout)
        except TimeoutError:
            return {"ok": False, "error": "timeout"}
        except Exception as e:
            logger.debug("health/check sub-probe failed: %s", e, exc_info=True)
            return {"ok": False, "error": str(e)[:200]}

    async def _probe_name_map():
        def _run():
            from backend.scripts.check_name_map import check_name_map

            try:
                unmapped = check_name_map()
            except Exception as e:
                return {"ok": False, "error": str(e)[:200], "missing": [], "count": 0}
            return {"ok": len(unmapped) == 0, "missing": sorted(unmapped)[:10], "count": len(unmapped)}

        return await asyncio.to_thread(_run)

    async def _probe_placeholders():
        def _run():
            from backend.scripts.check_placeholders import scan

            try:
                bad = scan()
            except Exception as e:
                return {"ok": False, "error": str(e)[:200], "count": 0, "issues": []}
            return {"ok": len(bad) == 0, "count": len(bad), "issues": bad[:5]}

        return await asyncio.to_thread(_run)

    async def _probe_biome():
        def _run():
            biome_bin = shutil.which("biome") or shutil.which("biome.exe")
            if biome_bin:
                try:
                    proc = run_hidden([biome_bin, "--version"], capture_output=True, text=True, timeout=5)
                    ver = (proc.stdout or proc.stderr).strip()
                    return {"ok": proc.returncode == 0, "version": ver[:120] if ver else None}
                except subprocess.TimeoutExpired:
                    return {"ok": False, "error": "timeout", "version": None}
                except Exception as e:
                    return {"ok": False, "error": str(e)[:200], "version": None}
            # Fallback via npx
            try:
                proc = run_hidden(["npx", "biome", "--version"], capture_output=True, text=True, timeout=5)
                ver = (proc.stdout or proc.stderr).strip()
                return {"ok": proc.returncode == 0, "version": ver[:120] if ver else None}
            except subprocess.TimeoutExpired:
                return {"ok": False, "error": "timeout", "version": None}
            except Exception as e:
                return {"ok": False, "error": str(e)[:200], "version": None}

        return await asyncio.to_thread(_run)

    async def _probe_ruff():
        def _run():
            ruff_bin = shutil.which("ruff") or shutil.which("ruff.exe")
            if not ruff_bin:
                return {"ok": False, "error": "ruff not found", "version": None}
            try:
                proc = run_hidden([ruff_bin, "--version"], capture_output=True, text=True, timeout=5)
                ver = (proc.stdout or proc.stderr).strip()
                return {"ok": proc.returncode == 0, "version": ver[:120] if ver else None}
            except subprocess.TimeoutExpired:
                return {"ok": False, "error": "timeout", "version": None}
            except Exception as e:
                return {"ok": False, "error": str(e)[:200], "version": None}

        return await asyncio.to_thread(_run)

    async def _probe_tsc():
        def _run():
            tsc_bin = shutil.which("tsc") or shutil.which("tsc.exe")
            # Also try npx tsc
            cmd = [tsc_bin, "--version"] if tsc_bin else ["npx", "tsc", "--version"]
            try:
                proc = run_hidden(cmd, capture_output=True, text=True, timeout=5)
                ver = (proc.stdout or proc.stderr).strip()
                return {"ok": proc.returncode == 0, "version": ver[:120] if ver else None}
            except subprocess.TimeoutExpired:
                return {"ok": False, "error": "timeout", "version": None}
            except Exception as e:
                return {"ok": False, "error": str(e)[:200], "version": None}

        return await asyncio.to_thread(_run)

    name_map = await _with_timeout(_probe_name_map())
    placeholders = await _with_timeout(_probe_placeholders())
    biome = await _with_timeout(_probe_biome())
    ruff = await _with_timeout(_probe_ruff())
    tsc = await _with_timeout(_probe_tsc())

    result = {
        "name_map": name_map,
        "placeholders": placeholders,
        "biome": biome,
        "ruff": ruff,
        "tsc": tsc,
        "cached_at": time.time(),
    }

    with _health_check_lock:
        _health_check_cache = result
        _health_check_at = now

    return result


# ── Feature availability ──────────────────────────────────────────────────
# Probes every optional dependency once at first call and caches the result.
# The frontend uses this to show/hide feature gates without guessing.

_feature_cache: dict | None = None
_feature_cache_at: float = 0.0
_feature_lock = threading.Lock()


def _probe_feature(module_name: str) -> dict:
    """Try to import a module and return availability metadata."""
    try:
        mod = __import__(module_name)
        version = getattr(mod, "__version__", None)
        return {"available": True, "version": str(version) if version else None}
    except ImportError:
        return {"available": False, "version": None}
    except Exception as exc:
        return {"available": False, "version": None, "error": str(exc)[:120]}


def _probe_all_features() -> dict:
    """Probe every optional feature and return a snapshot."""
    features: dict[str, dict] = {}

    # Audio DSP / Synthesis
    features["dsp_synth"] = _probe_feature("audio_dsp")
    features["pedalboard"] = _probe_feature("pedalboard")
    features["librosa"] = _probe_feature("librosa")
    features["espeakng_loader"] = _probe_feature("espeakng_loader")

    # Stem separation / cleanup
    features["demucs"] = _probe_feature("demucs")

    # Speech denoiser — ONNX path (torch-free) is the preferred engine.
    try:
        from ..services.deepfilter_onnx import is_onnx_available

        onnx_ok = is_onnx_available()
        features["deepfilternet"] = {
            "available": onnx_ok,
            "version": "onnx" if onnx_ok else None,
            "engine": "onnx",
        }
    except ImportError:
        features["deepfilternet"] = {"available": False, "version": None, "engine": None}

    # STT engines
    features["faster_whisper"] = _probe_feature("faster_whisper")
    features["pywhispercpp"] = _probe_feature("pywhispercpp")

    # ML frameworks
    try:
        import torch

        features["torch"] = {
            "available": True,
            "version": torch.__version__,
            "cuda": torch.cuda.is_available(),
        }
    except ImportError:
        features["torch"] = {"available": False, "version": None, "cuda": False}

    features["onnxruntime"] = _probe_feature("onnxruntime")

    # Translation
    features["argostranslate"] = _probe_feature("argostranslate")
    features["deep_translator"] = _probe_feature("deep_translator")

    # Speaker analysis
    features["resemblyzer"] = _probe_feature("resemblyzer")
    features["silero_vad"] = _probe_feature("silero_vad")
    features["sklearn"] = _probe_feature("sklearn")

    # Import / export
    features["pymupdf"] = _probe_feature("fitz")
    features["yt_dlp"] = _probe_feature("yt_dlp")

    # DSP (via audio-dsp)
    features["audio_dsp"] = features["dsp_synth"]  # alias

    return {"features": features, "probed_at": time.time()}


@router.get("/health/features")
def health_features():
    """Report which optional features/packages are available.

    Cached for 60 s to avoid repeated import probes.
    The frontend uses this to show/hide DSP, stem separation,
    translation, and other feature gates.
    """
    global _feature_cache, _feature_cache_at

    now = time.monotonic()
    with _feature_lock:
        if _feature_cache is not None and (now - _feature_cache_at) < 60:
            return _feature_cache

    result = _probe_all_features()

    with _feature_lock:
        _feature_cache = result
        _feature_cache_at = now

    return result


# ── DSP subsystem health ──────────────────────────────────────────────────
# Dedicated endpoint for the Synth / DSP tab. Reports audio-dsp
# availability, available synthesizers, and effects in one call so the
# frontend can show a feature gate without loading the full catalog.


def _probe_dsp() -> dict:
    """Probe the DSP subsystem and return a detailed snapshot."""
    audio_dsp = _probe_feature("audio_dsp")
    pedalboard = _probe_feature("pedalboard")

    synths: list[str] = []
    effects: list[str] = []

    if audio_dsp["available"]:
        synths = [
            "subtractive",
            "fm",
            "drum",
            "chiptone",
            "pluck",
            "dialup",
            "robot_speech",
        ]
        effects = [
            "vocoder",
            "bitcrush",
            "distortion",
            "tape",
            "filter",
            "delay",
            "phaser",
            "pitch",
            "ringmod",
            "reverb",
            "robotize",
        ]

    return {
        "dsp_synth": {
            "available": audio_dsp["available"],
            "version": audio_dsp.get("version"),
            "synthesizers": synths,
            "effects": effects,
        },
        "pedalboard": {
            "available": pedalboard["available"],
            "version": pedalboard.get("version"),
        },
        "probed_at": time.time(),
    }


@router.get("/health/dsp")
def health_dsp():
    """DSP subsystem health — synthesizers, effects, and pedalboard status.

    Cached for 60 s. The Synth / DSP workspace tab uses this to
    show a feature gate when audio-dsp is not installed.
    """
    global _feature_cache, _feature_cache_at

    now = time.monotonic()
    with _feature_lock:
        if _feature_cache is not None and (now - _feature_cache_at) < 60:
            dsp = _feature_cache.get("_dsp")
            if dsp is not None:
                return dsp

    dsp = _probe_dsp()

    with _feature_lock:
        if _feature_cache is None:
            _feature_cache = {}
        _feature_cache["_dsp"] = dsp

    return dsp
