"""Per-engine always-on (keepalive) toggle endpoints."""

from pydantic import BaseModel

from .common import router


class _AlwaysOnToggle(BaseModel):
    engine: str
    always_on: bool


@router.get("/models/always-on")
async def get_always_on():
    """Engines the user has chosen to keep resident (plus the planner default)."""
    from ...services.always_on import get_always_on_engines

    return {"engines": sorted(get_always_on_engines())}


@router.post("/models/always-on")
async def toggle_always_on(payload: _AlwaysOnToggle):
    """Flip an engine's always-on flag and refresh the lifecycle manager."""
    from ...services.always_on import set_engine_always_on
    from ...utils.model_lifecycle import lifecycle_manager

    engines = set_engine_always_on(payload.engine, payload.always_on)
    lifecycle_manager.refresh_always_on()
    return {"engines": sorted(engines), "engine": payload.engine, "always_on": payload.always_on}
