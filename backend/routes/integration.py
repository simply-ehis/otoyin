"""otoyin integration endpoints — optional, graceful in standalone mode."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

_standalone_mode = True
_project_loaded = False


def set_standalone_mode(standalone: bool):
    global _standalone_mode
    _standalone_mode = standalone


def is_standalone() -> bool:
    return _standalone_mode


class ProjectLoadRequest(BaseModel):
    project_json: str


class AudioReturnRequest(BaseModel):
    scene_id: str
    tracks: list[dict]


class TimelineSyncRequest(BaseModel):
    time: float
    playing: bool
    source: str = "21labs"


@router.get("/integration/status")
async def integration_status():
    """Check if running standalone or connected to Leone."""
    return {
        "standalone": _standalone_mode,
        "project_loaded": _project_loaded,
        "mode": "standalone" if _standalone_mode else "21labs",
    }


@router.post("/integration/project/load")
async def load_leone_project(data: ProjectLoadRequest):
    """Load project data from Leone. Gracefully ignored in standalone mode."""
    if _standalone_mode:
        return {"status": "ignored", "reason": "running in standalone mode"}
    from ..services.leone_integration import parse_leone_project

    try:
        project = parse_leone_project(data.project_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid project data: {e}") from e
    global _project_loaded
    _project_loaded = True
    return {
        "status": "loaded",
        "movie_title": project.movie_title,
        "fps": project.fps,
        "scene_count": len(project.scenes),
        "character_count": len(project.characters),
    }


@router.post("/integration/audio/return")
async def commit_audio_to_scene(data: AudioReturnRequest):
    """Commit generated audio back to Leone. Gracefully ignored in standalone mode."""
    if _standalone_mode:
        return {"status": "ignored", "reason": "running in standalone mode"}
    from ..services.leone_integration import prepare_audio_return

    prepare_audio_return(data.scene_id, data.tracks)
    return {"status": "committed", "scene_id": data.scene_id, "track_count": len(data.tracks)}


@router.post("/integration/timeline/sync")
async def sync_timeline(data: TimelineSyncRequest):
    """Sync timeline position. Always works (no-op in standalone)."""
    return {
        "time": data.time,
        "playing": data.playing,
        "source": data.source,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/integration/events")
async def list_integration_events():
    """List available integration events."""
    from ..services.leone_integration import INTEGRATION_EVENTS

    events = [{"event": k, "description": v, "active": not _standalone_mode} for k, v in INTEGRATION_EVENTS.items()]
    return events
