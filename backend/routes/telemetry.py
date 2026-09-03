"""Telemetry routes — anonymous usage analytics.

These endpoints serve the in-app Telemetry page and are gated by the user's
telemetry preference (disabled by default). All data is anonymous and
aggregated; no PII is stored.
"""

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services.telemetry import (
    disable_telemetry,
    enable_telemetry,
    get_summary,
    get_timeline,
    is_enabled,
    query_events,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["telemetry"])


class ToggleRequest(BaseModel):
    enabled: bool


@router.get("/status")
async def get_telemetry_status():
    """Return whether telemetry is currently enabled for this user."""
    return {"enabled": is_enabled()}


@router.post("/toggle")
async def toggle_telemetry(request: ToggleRequest):
    """Enable or disable telemetry collection."""
    if request.enabled:
        enable_telemetry()
    else:
        disable_telemetry()
    return {"enabled": is_enabled(), "message": "Telemetry preference updated"}


@router.get("/events")
async def get_telemetry_events(
    event_type: str | None = None,
    since: str | None = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
):
    """Query telemetry events with optional filters."""
    if not is_enabled():
        raise HTTPException(status_code=403, detail="Telemetry is disabled")

    return query_events(
        event_type=event_type,
        since=since,
        limit=limit,
        offset=offset,
    )


@router.get("/summary")
async def get_telemetry_summary(since: str | None = None):
    """Get aggregated telemetry summary."""
    if not is_enabled():
        raise HTTPException(status_code=403, detail="Telemetry is disabled")

    summary = get_summary()

    if since:
        filtered = query_events(since=since)
        # Recompute active_days for the filtered window
        try:
            from datetime import datetime as _dt

            since_dt = _dt.fromisoformat(since)
            active = set()
            for ev in filtered["events"]:
                try:
                    active.add(_dt.fromisoformat(ev.get("timestamp", "")).date().isoformat())
                except Exception:
                    pass
            active_days = len(active)
        except Exception:
            active_days = summary.get("active_days", 0)
        # Count by type for filtered window
        by_type: dict[str, int] = {}
        for ev in filtered["events"]:
            by_type[ev.get("name", "unknown")] = by_type.get(ev.get("name", "unknown"), 0) + 1
        return {
            "total_events": len(filtered["events"]),
            "active_days": active_days,
            "event_counts": by_type,
        }

    return {
        "total_events": summary.get("total_events", 0),
        "active_days": summary.get("active_days", 0),
        "event_counts": summary.get("events_by_type", {}),
    }


@router.get("/timeline")
async def get_telemetry_timeline(
    since: str | None = None,
    bucket: str = Query(default="day", pattern="^(hour|day|week)$"),
):
    """Get event volume over time, bucketed by hour/day/week."""
    if not is_enabled():
        raise HTTPException(status_code=403, detail="Telemetry is disabled")

    timeline = get_timeline(since=since, bucket=bucket)
    return {"timeline": timeline}
