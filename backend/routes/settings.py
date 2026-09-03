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
    return settings_service.get_assistant_settings(db)


@router.put("/assistant", response_model=models.AssistantSettingsResponse)
async def update_assistant_settings_endpoint(
    patch: models.AssistantSettingsUpdate,
    db: Session = Depends(get_db),
):
    return settings_service.update_assistant_settings(db, patch.model_dump(exclude_unset=True))


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
