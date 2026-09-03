"""Leone integration layer for otoyin.

Handles IPC events, project data exchange, timeline sync,
and audio return between otoyin and Leone.
"""

import json
from dataclasses import dataclass, field


@dataclass
class LeoneProject:
    movie_title: str
    fps: float = 24.0
    scenes: list[dict] = field(default_factory=list)
    characters: list[dict] = field(default_factory=list)
    asset_store_audio: list[dict] = field(default_factory=list)


@dataclass
class AudioReturnTrack:
    character: str | None = None
    track_type: str = "dialogue"
    file: str = ""
    start_time: float = 0.0
    end_time: float = 0.0
    loop: bool = False


def parse_leone_project(json_str: str) -> LeoneProject:
    """Parse project data from Leone."""
    data = json.loads(json_str)
    return LeoneProject(
        movie_title=data.get("movie_title", ""),
        fps=data.get("fps", 24.0),
        scenes=data.get("scenes", []),
        characters=data.get("characters", []),
        asset_store_audio=data.get("asset_store_audio", []),
    )


def prepare_audio_return(scene_id: str, tracks: list[dict]) -> dict:
    """Prepare audio return data for Leone."""
    return {
        "scene_id": scene_id,
        "tracks": [
            {
                "character": t.get("character"),
                "type": t.get("type", "dialogue"),
                "file": t.get("file", ""),
                "start_time": t.get("start_time", 0.0),
                "end_time": t.get("end_time", 0.0),
                "loop": t.get("loop", False),
            }
            for t in tracks
        ],
    }


INTEGRATION_EVENTS = {
    "otoyin:project-load": "Leone → otoyin: Load project on launch",
    "timeline:position": "Bidirectional: Scrubbing/playing sync",
    "otoyin:audio-committed": "otoyin → Leone: Audio generated",
    "otoyin:project-saved": "otoyin → Leone: Session saved",
    "leone:script-updated": "Leone → otoyin: Script changed",
}
