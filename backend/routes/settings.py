"""User settings endpoints — capture/refine and generation defaults."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..services import settings as settings_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


def _require_localhost(request: Request) -> None:
    """Guard for process-control endpoints: only allow connections from loopback."""
    client = request.client
    if client is None:
        return
    host = client.host
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Process control endpoints are localhost-only")


@router.get("/captures", response_model=models.CaptureSettingsResponse)
async def get_capture_settings_endpoint(db: Session = Depends(get_db)):
    return settings_service.get_capture_settings(db)


@router.put("/captures", response_model=models.CaptureSettingsResponse)
async def update_capture_settings_endpoint(
    patch: models.CaptureSettingsUpdate,
    db: Session = Depends(get_db),
):
    return settings_service.update_capture_settings(db, patch.model_dump(exclude_unset=True))


@router.get("/generation", response_model=models.GenerationSettingsResponse)
async def get_generation_settings_endpoint(db: Session = Depends(get_db)):
    return settings_service.get_generation_settings(db)


@router.put("/generation", response_model=models.GenerationSettingsResponse)
async def update_generation_settings_endpoint(
    patch: models.GenerationSettingsUpdate,
    db: Session = Depends(get_db),
):
    return settings_service.update_generation_settings(db, patch.model_dump(exclude_unset=True))


@router.get("/assistant", response_model=models.AssistantSettingsResponse)
async def get_assistant_settings_endpoint(db: Session = Depends(get_db)):
    row = settings_service.get_assistant_settings(db)
    payload = models.AssistantSettingsResponse.model_validate(row).model_dump()
    # Live planner state: best-effort, never fails the settings read.
    try:
        from ..backends import get_llm_backend_for_engine

        planner = get_llm_backend_for_engine("gguf_llm")
        loaded = bool(planner.is_loaded())
        payload["planner_loaded"] = loaded
        payload["loaded_n_ctx"] = getattr(planner, "n_ctx", None) if loaded else None
        payload["loaded_model_size"] = getattr(planner, "_current_model_size", None) if loaded else None
        payload["loaded_kv_quant"] = getattr(planner, "kv_quant", None) if loaded else None
        payload["loaded_gpu_layers"] = getattr(planner, "gpu_layers", None) if loaded else None
    except Exception:
        logger.debug("Planner live state unavailable", exc_info=True)
    try:
        import os

        n_ctx, _ = settings_service.compute_effective_tokens(row.model_size, row.context_tokens, row.max_tokens)
        payload["effective_n_ctx"] = n_ctx
        layers, from_env = settings_service.resolve_gpu_layers(
            os.environ.get("TWENTYLABS_LLAMA_GPU_LAYERS"), row.gpu_layers
        )
        payload["effective_gpu_layers"] = layers
        payload["gpu_layers_env_override"] = from_env
    except Exception:
        logger.debug("Effective planner values unavailable", exc_info=True)
    return payload


@router.put("/assistant", response_model=models.AssistantSettingsResponse)
async def update_assistant_settings_endpoint(
    patch: models.AssistantSettingsUpdate,
    db: Session = Depends(get_db),
):
    return settings_service.update_assistant_settings(db, patch.model_dump(exclude_unset=True))


@router.post("/assistant/reload-planner")
async def reload_planner_endpoint():
    """Unload the GGUF planner so the next chat reloads it with the current
    settings (context_tokens / kv_quant only apply at load time).

    Unloading is instantaneous and stateless (llama-server holds no
    conversation state — history lives client-side), so this is safe to
    call any time; the cost is one model load on the next request.
    """
    try:
        from ..backends import get_llm_backend_for_engine

        planner = get_llm_backend_for_engine("gguf_llm")
        if planner.is_loaded():
            planner.unload_model()
            return {"unloaded": True, "message": "Planner unloaded — next chat loads with current settings."}
        return {"unloaded": False, "message": "Planner was not loaded — settings already apply to the next chat."}
    except Exception as e:
        logger.debug("Planner reload failed", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not unload planner: {e}") from e


# ---------------------------------------------------------------------------
# Serving port (bind address for the next backend start)
# ---------------------------------------------------------------------------


@router.get("/server", response_model=models.ServerPortResponse)
async def get_server_port_endpoint(db: Session = Depends(get_db)):
    """Serving port state: bound now vs persisted for the next boot."""
    from .. import config

    persisted = settings_service.get_persisted_server_port(db)
    current = config.get_runtime_port() or config.get_server_port()
    port = persisted if persisted is not None else current
    return {"port": port, "current_port": current, "needs_restart": port != current}


@router.put("/server", response_model=models.ServerPortResponse)
async def update_server_port_endpoint(
    patch: models.ServerPortUpdate,
    db: Session = Depends(get_db),
):
    """Persist the serving port. Takes effect on the next backend start —
    the response tells the UI whether a restart is needed, and the Tauri
    sidecar / launcher resolves CLI > env > this setting > default.
    """
    from .. import config
    from ..utils.port import is_port_free

    current = config.get_runtime_port() or config.get_server_port()
    if patch.port != current and not is_port_free("127.0.0.1", patch.port):
        raise HTTPException(
            status_code=400,
            detail=f"Port {patch.port} is already in use — pick a free port.",
        )
    settings_service.set_persisted_server_port(db, patch.port)
    return {"port": patch.port, "current_port": current, "needs_restart": patch.port != current}


# ---------------------------------------------------------------------------
# Performance mode (speed vs RAM)
# ---------------------------------------------------------------------------


@router.get("/performance", response_model=models.PerformanceSettingsResponse)
async def get_performance_settings_endpoint(db: Session = Depends(get_db)):
    return settings_service.get_performance_settings(db)


@router.put("/performance", response_model=models.PerformanceSettingsResponse)
async def update_performance_settings_endpoint(
    patch: models.PerformanceSettingsUpdate,
    db: Session = Depends(get_db),
):
    row = settings_service.update_performance_settings(db, patch.model_dump(exclude_unset=True))
    # Apply immediately so the speed/RAM trade-off takes effect without waiting
    # for the next idle-poll cycle.
    try:
        from ..utils.model_lifecycle import lifecycle_manager

        if patch.performance_mode is not None:
            lifecycle_manager.set_performance_mode(patch.performance_mode)
        if patch.per_engine_keepalive is not None:
            # Refresh both fields from DB so merges are reflected
            lifecycle_manager.refresh_performance_mode()
    except Exception:
        logger.debug("Could not apply performance mode to lifecycle manager", exc_info=True)
    return row


# ---------------------------------------------------------------------------
# Voice-changer control
# ---------------------------------------------------------------------------


@router.post("/voice-changer/spawn")
async def spawn_voice_changer_endpoint(request: Request):
    """Spawn the headless voice-changer service. Localhost-only."""
    _require_localhost(request)

    from ..voice_changer import get_voice_changer_port, is_voice_changer_running, spawn_voice_changer

    if is_voice_changer_running():
        return {"status": "already_running", "port": get_voice_changer_port()}

    from ..services.memory import get_voice_chat_settings

    vc_settings = get_voice_chat_settings()
    port = vc_settings.get("voice_changer_port", 17494)

    proc = spawn_voice_changer(port=port)
    if proc:
        actual_port = get_voice_changer_port() or port
        return {"status": "spawned", "pid": proc.pid, "port": actual_port}
    return {
        "status": "error",
        "message": "Failed to spawn voice-changer — port may be busy; check /voice-changer/status",
    }


@router.post("/voice-changer/kill")
async def kill_voice_changer_endpoint(request: Request):
    """Terminate the headless voice-changer service. Localhost-only."""
    _require_localhost(request)

    from ..voice_changer import is_voice_changer_running, kill_voice_changer

    if not is_voice_changer_running():
        return {"status": "not_running"}

    kill_voice_changer()
    return {"status": "killed"}


@router.get("/voice-changer/status")
async def voice_changer_status_endpoint():
    """Check voice-changer service status."""
    from ..voice_changer import _vc_port, _vc_process, is_voice_changer_running

    running = is_voice_changer_running()
    pid = _vc_process.pid if running else None
    port = _vc_port if running else None
    return {"running": running, "pid": pid, "port": port}
