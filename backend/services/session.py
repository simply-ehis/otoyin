"""Session management for otoyin — .dstf format.

.dstf = otoyin Timeline Format. A JSON file containing all
clip positions, effect chains, mixer settings, voice profiles,
and the Audio Plan.
"""

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class SessionClip:
    id: str
    generation_id: str
    start_time_ms: float
    track: int = 0
    trim_start_ms: float = 0.0
    trim_end_ms: float = 0.0
    volume: float = 1.0
    fade_in_ms: float = 0.0
    fade_out_ms: float = 0.0
    gain_db: float = 0.0
    version_id: str | None = None
    effects_chain: list[dict] = field(default_factory=list)


@dataclass
class SessionMixerTrack:
    id: str
    name: str
    volume: float = 1.0
    pan: float = 0.0
    muted: bool = False
    solo: bool = False
    bus_id: str | None = None
    effects_chain: list[dict] = field(default_factory=list)


@dataclass
class SessionMixerBus:
    id: str
    name: str
    volume: float = 1.0
    pan: float = 0.0
    effects_chain: list[dict] = field(default_factory=list)


@dataclass
class SessionState:
    version: str = "1.0"
    name: str = "Untitled Session"
    created_at: str = ""
    updated_at: str = ""
    fps: float = 24.0
    sample_rate: int = 48000
    clips: list[SessionClip] = field(default_factory=list)
    mixer_tracks: list[SessionMixerTrack] = field(default_factory=list)
    mixer_buses: list[SessionMixerBus] = field(default_factory=list)
    master_volume: float = 1.0
    audio_plan_json: str | None = None
    markers: list[dict] = field(default_factory=list)


def create_session(name: str = "Untitled") -> SessionState:
    return SessionState(
        name=name,
        created_at=datetime.now(UTC).isoformat(),
        updated_at=datetime.now(UTC).isoformat(),
    )


def session_to_dict(session: SessionState) -> dict:
    return {
        "version": session.version,
        "name": session.name,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "fps": session.fps,
        "sample_rate": session.sample_rate,
        "clips": [
            {
                "id": c.id,
                "generation_id": c.generation_id,
                "start_time_ms": c.start_time_ms,
                "track": c.track,
                "trim_start_ms": c.trim_start_ms,
                "trim_end_ms": c.trim_end_ms,
                "volume": c.volume,
                "fade_in_ms": c.fade_in_ms,
                "fade_out_ms": c.fade_out_ms,
                "gain_db": c.gain_db,
                "version_id": c.version_id,
                "effects_chain": c.effects_chain,
            }
            for c in session.clips
        ],
        "mixer_tracks": [
            {
                "id": t.id,
                "name": t.name,
                "volume": t.volume,
                "pan": t.pan,
                "muted": t.muted,
                "solo": t.solo,
                "bus_id": t.bus_id,
                "effects_chain": t.effects_chain,
            }
            for t in session.mixer_tracks
        ],
        "mixer_buses": [
            {
                "id": b.id,
                "name": b.name,
                "volume": b.volume,
                "pan": b.pan,
                "effects_chain": b.effects_chain,
            }
            for b in session.mixer_buses
        ],
        "master_volume": session.master_volume,
        "audio_plan_json": session.audio_plan_json,
        "markers": session.markers,
    }


def session_from_json(json_str: str) -> SessionState:
    data = json.loads(json_str)
    session = SessionState(
        version=data.get("version", "1.0"),
        name=data.get("name", "Untitled"),
        created_at=data.get("created_at", ""),
        updated_at=data.get("updated_at", ""),
        fps=data.get("fps", 24.0),
        sample_rate=data.get("sample_rate", 48000),
        master_volume=data.get("master_volume", 1.0),
        audio_plan_json=data.get("audio_plan_json"),
        markers=data.get("markers", []),
    )
    for c in data.get("clips", []):
        session.clips.append(SessionClip(**c))
    for t in data.get("mixer_tracks", []):
        session.mixer_tracks.append(SessionMixerTrack(**t))
    for b in data.get("mixer_buses", []):
        session.mixer_buses.append(SessionMixerBus(**b))
    return session


def validate_session(session: SessionState) -> list[str]:
    warnings = []
    if not session.clips:
        warnings.append("Session has no clips")
    for clip in session.clips:
        if clip.start_time_ms < 0:
            warnings.append(f"Clip {clip.id} has negative start time")
        if clip.trim_start_ms + clip.trim_end_ms < 0:
            warnings.append(f"Clip {clip.id} has invalid trim values")
    return warnings
