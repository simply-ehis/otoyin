"""AI Audio Plan system for 21labs.

Generates a production plan for dialogue, SFX, and music
based on script analysis. Supports Guided and Auto modes.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DialogueLine:
    character: str
    text: str
    emotion: str | None = None
    voice_profile_id: str | None = None
    engine: str | None = None


@dataclass
class AudioPlanTrack:
    id: str
    track_type: str  # "dialogue", "sfx", "music"
    name: str
    character: str | None = None
    dialogue_line: DialogueLine | None = None
    start_time_ms: float = 0.0
    end_time_ms: float = 0.0
    notes: str = ""


@dataclass
class AudioPlanScene:
    scene_id: str
    scene_name: str
    duration_seconds: float
    fps: float = 24.0
    tracks: list[AudioPlanTrack] = field(default_factory=list)


@dataclass
class AudioPlan:
    id: str
    movie_title: str
    scenes: list[AudioPlanScene] = field(default_factory=list)
    mode: str = "guided"  # "guided" or "auto"
    status: str = "draft"  # "draft", "ready", "generating", "complete"
    notes: str = ""


def generate_auto_plan(
    scenes: list[dict],
    characters: list[dict],
    fps: float = 24.0,
) -> AudioPlan:
    """Automatically generate an audio plan from scene data.

    Analyzes scenes and assigns dialogue tracks, suggests SFX,
    and recommends music cues.
    """
    plan = AudioPlan(
        id="auto-plan",
        movie_title="",
        mode="auto",
        scenes=[],
    )

    for scene_data in scenes:
        scene = AudioPlanScene(
            scene_id=scene_data.get("id", ""),
            scene_name=scene_data.get("name", ""),
            duration_seconds=scene_data.get("duration", 0.0),
            fps=fps,
            tracks=[],
        )

        dialogue = scene_data.get("dialogue", [])
        time_offset = 0.0
        for line_data in dialogue:
            character = line_data.get("character", "")
            line = DialogueLine(
                character=character,
                text=line_data.get("text", ""),
                emotion=line_data.get("emotion", "neutral"),
            )
            estimated_duration = max(2.0, len(line.text) * 0.08)
            track = AudioPlanTrack(
                id=f"dialogue-{scene.scene_id}-{len(scene.tracks)}",
                track_type="dialogue",
                name=f"{character} Line",
                character=character,
                dialogue_line=line,
                start_time_ms=time_offset * 1000,
                end_time_ms=(time_offset + estimated_duration) * 1000,
                notes=f"Auto-generated. Emotion: {line.emotion}",
            )
            scene.tracks.append(track)
            time_offset += estimated_duration + 0.5

        if scene.tracks:
            sfx_track = AudioPlanTrack(
                id=f"sfx-{scene.scene_id}",
                track_type="sfx",
                name="Ambient SFX",
                start_time_ms=0,
                end_time_ms=scene.duration_seconds * 1000,
                notes="Suggested: room tone / ambience",
            )
            scene.tracks.append(sfx_track)

            music_track = AudioPlanTrack(
                id=f"music-{scene.scene_id}",
                track_type="music",
                name="Underscore",
                start_time_ms=0,
                end_time_ms=scene.duration_seconds * 1000,
                notes="Suggested: mood-based underscore",
            )
            scene.tracks.append(music_track)

        plan.scenes.append(scene)

    return plan


def _safe_plan_id(plan_id: str) -> str:
    """Plan ids become filenames; refuse anything but a simple token."""
    import re

    if not re.fullmatch(r"[A-Za-z0-9._-]+", plan_id or ""):
        raise ValueError(f"Unsafe plan id: {plan_id!r}")
    return plan_id


def _plans_dir() -> Path:
    """Data directory holding per-plan JSON files (created)."""
    from .. import config

    directory = Path(config.get_data_dir()) / "plans"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _plans_dir_read() -> Path:
    from .. import config

    return Path(config.get_data_dir()) / "plans"


def save_plan_to_disk(plan: AudioPlan) -> None:
    """Persist a plan to ``data/plans/<id>.json`` (atomic via tmp + replace)."""
    plan_id = _safe_plan_id(plan.id)
    directory = _plans_dir()
    path = directory / f"{plan_id}.json"
    tmp_path = directory / f"{plan_id}.json.tmp"
    tmp_path.write_text(plan_to_json(plan), encoding="utf-8")
    tmp_path.replace(path)


def load_plan_from_disk(plan_id: str) -> AudioPlan | None:
    """Load a persisted plan; returns None when it does not exist."""
    try:
        plan_id = _safe_plan_id(plan_id)
    except ValueError:
        return None
    path = _plans_dir_read() / f"{plan_id}.json"
    if not path.is_file():
        return None
    return plan_from_json(path.read_text(encoding="utf-8"))


def plan_to_json(plan: AudioPlan) -> str:
    """Serialize an AudioPlan to JSON."""
    data = {
        "id": plan.id,
        "movie_title": plan.movie_title,
        "mode": plan.mode,
        "status": plan.status,
        "notes": plan.notes,
        "scenes": [],
    }
    for scene in plan.scenes:
        scene_data = {
            "scene_id": scene.scene_id,
            "scene_name": scene.scene_name,
            "duration_seconds": scene.duration_seconds,
            "fps": scene.fps,
            "tracks": [],
        }
        for track in scene.tracks:
            track_data = {
                "id": track.id,
                "track_type": track.track_type,
                "name": track.name,
                "character": track.character,
                "start_time_ms": track.start_time_ms,
                "end_time_ms": track.end_time_ms,
                "notes": track.notes,
            }
            if track.dialogue_line:
                track_data["dialogue_line"] = {
                    "character": track.dialogue_line.character,
                    "text": track.dialogue_line.text,
                    "emotion": track.dialogue_line.emotion,
                    "voice_profile_id": track.dialogue_line.voice_profile_id,
                    "engine": track.dialogue_line.engine,
                }
            scene_data["tracks"].append(track_data)
        data["scenes"].append(scene_data)
    return json.dumps(data, indent=2)


def plan_from_json(json_str: str) -> AudioPlan:
    """Deserialize an AudioPlan from JSON."""
    data = json.loads(json_str)
    plan = AudioPlan(
        id=data.get("id", ""),
        movie_title=data.get("movie_title", ""),
        mode=data.get("mode", "guided"),
        status=data.get("status", "draft"),
        notes=data.get("notes", ""),
    )
    for scene_data in data.get("scenes", []):
        scene = AudioPlanScene(
            scene_id=scene_data.get("scene_id", ""),
            scene_name=scene_data.get("scene_name", ""),
            duration_seconds=scene_data.get("duration_seconds", 0.0),
            fps=scene_data.get("fps", 24.0),
        )
        for track_data in scene_data.get("tracks", []):
            dialogue_line = None
            if "dialogue_line" in track_data:
                dl = track_data["dialogue_line"]
                dialogue_line = DialogueLine(
                    character=dl.get("character", ""),
                    text=dl.get("text", ""),
                    emotion=dl.get("emotion"),
                    voice_profile_id=dl.get("voice_profile_id"),
                    engine=dl.get("engine"),
                )
            track = AudioPlanTrack(
                id=track_data.get("id", ""),
                track_type=track_data.get("track_type", ""),
                name=track_data.get("name", ""),
                character=track_data.get("character"),
                dialogue_line=dialogue_line,
                start_time_ms=track_data.get("start_time_ms", 0.0),
                end_time_ms=track_data.get("end_time_ms", 0.0),
                notes=track_data.get("notes", ""),
            )
            scene.tracks.append(track)
        plan.scenes.append(scene)
    return plan
