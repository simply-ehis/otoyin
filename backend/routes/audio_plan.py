"""AI Audio Plan endpoints."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.audio_plan import (
    AudioPlan,
    DialogueLine,
    generate_auto_plan,
    load_plan_from_disk,
    plan_from_json,
    plan_to_json,
    save_plan_to_disk,
)

router = APIRouter()

logger = logging.getLogger(__name__)

# In-memory cache for speed; plans are also persisted to data/plans/<id>.json
# so restarts don't drop voice/engine edits. Memory is a cache, disk is truth.
PLANS: dict[str, AudioPlan] = {}


def _get_plan(plan_id: str) -> AudioPlan:
    plan = PLANS.get(plan_id)
    if plan is not None:
        return plan
    plan = load_plan_from_disk(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found")
    PLANS[plan_id] = plan
    return plan


def _set_plan(plan: AudioPlan) -> None:
    PLANS[plan.id] = plan
    try:
        save_plan_to_disk(plan)
    except OSError as exc:
        # In-memory state is still valid for this session — but say so loudly.
        logger.warning("audio_plan: failed to persist plan %s: %s", plan.id, exc)


class DialogueLineModel(BaseModel):
    character: str
    text: str
    emotion: str | None = "neutral"


class SceneInput(BaseModel):
    id: str
    name: str
    duration: float
    dialogue: list[DialogueLineModel] = Field(default_factory=list)


class AutoPlanRequest(BaseModel):
    scenes: list[SceneInput]
    characters: list[dict] = Field(default_factory=list)
    fps: float = 24.0


class PlanTrackUpdate(BaseModel):
    track_id: str
    start_time_ms: float | None = None
    end_time_ms: float | None = None
    notes: str | None = None
    voice_profile_id: str | None = None
    engine: str | None = None


class PlanSaveRequest(BaseModel):
    plan_json: str


@router.post("/audio-plan/auto")
async def create_auto_plan(data: AutoPlanRequest):
    """Generate an automatic audio plan from scene data."""
    scenes = [s.model_dump() for s in data.scenes]
    plan = generate_auto_plan(scenes, data.characters, data.fps)
    _set_plan(plan)
    return {"plan_json": plan_to_json(plan)}


@router.post("/audio-plan/track")
async def update_plan_track(data: PlanTrackUpdate):
    """Update a single plan track's voice_profile_id/engine (and timing/notes).

    Returns the updated plan_json so the frontend can re-render with the new
    voice/engine assignment.
    """
    if not data.track_id:
        raise HTTPException(status_code=400, detail="track_id is required")
    plan = _get_plan("auto-plan")
    for scene in plan.scenes:
        for track in scene.tracks:
            if track.id != data.track_id:
                continue
            if track.dialogue_line is None:
                track.dialogue_line = DialogueLine(
                    character=track.character or "",
                    text="",
                )
            if data.voice_profile_id is not None:
                track.dialogue_line.voice_profile_id = data.voice_profile_id
            if data.engine is not None:
                track.dialogue_line.engine = data.engine
            if data.start_time_ms is not None:
                track.start_time_ms = data.start_time_ms
            if data.end_time_ms is not None:
                track.end_time_ms = data.end_time_ms
            if data.notes is not None:
                track.notes = data.notes
            _set_plan(plan)
            return {"plan_json": plan_to_json(plan), "track_id": track.id}
    raise HTTPException(status_code=404, detail=f"Track '{data.track_id}' not found in plan")


@router.post("/audio-plan/validate")
async def validate_plan(data: PlanSaveRequest):
    """Validate an audio plan JSON."""
    try:
        plan = plan_from_json(data.plan_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid plan JSON: {e}") from e

    warnings = []
    for scene in plan.scenes:
        for track in scene.tracks:
            if track.track_type == "dialogue" and track.dialogue_line:
                if not track.dialogue_line.text:
                    warnings.append(f"Scene '{scene.scene_name}': Empty dialogue text in {track.name}")
                if not track.character:
                    warnings.append(f"Scene '{scene.scene_name}': No character assigned to {track.name}")
            if track.start_time_ms >= track.end_time_ms:
                warnings.append(f"Scene '{scene.scene_name}': Invalid time range in {track.name}")

    return {
        "valid": len(warnings) == 0,
        "warnings": warnings,
        "scene_count": len(plan.scenes),
        "track_count": sum(len(s.tracks) for s in plan.scenes),
    }


@router.get("/audio-plan/stats")
async def plan_stats(data: PlanSaveRequest):
    """Get statistics for an audio plan."""
    try:
        plan = plan_from_json(data.plan_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid plan JSON: {e}") from e

    dialogue_count = 0
    sfx_count = 0
    music_count = 0
    total_duration = 0.0
    characters = set()

    for scene in plan.scenes:
        total_duration = max(total_duration, scene.duration_seconds)
        for track in scene.tracks:
            if track.track_type == "dialogue":
                dialogue_count += 1
                if track.character:
                    characters.add(track.character)
            elif track.track_type == "sfx":
                sfx_count += 1
            elif track.track_type == "music":
                music_count += 1

    return {
        "dialogue_lines": dialogue_count,
        "sfx_tracks": sfx_count,
        "music_tracks": music_count,
        "total_scenes": len(plan.scenes),
        "unique_characters": len(characters),
        "estimated_duration_seconds": total_duration,
    }
