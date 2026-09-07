"""
Launcher session models — clip grid, tracks, and session capture.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LauncherTrackPayload(BaseModel):
    """A single track in the launcher grid."""

    id: str
    name: str = ""
    kind: str = "audio"
    color: str = "#58d6c7"
    volume: float = Field(default=0.78, ge=0.0, le=2.0)
    pan: float = Field(default=0.0, ge=-1.0, le=1.0)
    mute: bool = False
    solo: bool = False
    session_slots: list[str | None] = Field(default_factory=list, alias="sessionSlots")


class LauncherClipPayload(BaseModel):
    """A clip source (audio or MIDI) in the launcher grid."""

    id: str
    type: str = "audio"
    name: str = ""
    color: str = "#58d6c7"
    length_beats: float = Field(default=4.0, alias="lengthBeats")
    # Audio clip fields
    sample_rate: int = Field(default=44100, alias="sampleRate")
    channels: int = 2
    frames: int = 0
    audio_path: str = Field(default="", alias="audioPath")
    waveform_peaks: list[float] | None = Field(None, alias="waveformPeaks")
    trim_start: float = Field(default=0.0, alias="trimStart")
    trim_end: float = Field(default=0.0, alias="trimEnd")
    gain: float = 1.0
    volume_automation: list[float] = Field(default_factory=list, alias="volumeAutomation")
    # MIDI clip fields
    notes: list[dict] = Field(default_factory=list)


class LauncherSessionPayload(BaseModel):
    """Full launcher session state (tracks + clips + settings)."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = "Untitled session"
    bpm: float = Field(default=120.0, ge=30.0, le=300.0)
    master_volume: float = Field(default=0.84, alias="masterVolume")
    tracks: list[LauncherTrackPayload] = Field(default_factory=list)
    clips: dict[str, LauncherClipPayload] = Field(default_factory=dict)
    num_scenes: int = Field(default=4, alias="numScenes")


class LauncherSessionCreate(BaseModel):
    """Request model for creating/updating a launcher session."""

    name: str = Field(default="Untitled session", max_length=200)
    session: LauncherSessionPayload = Field(default_factory=LauncherSessionPayload)


class LauncherSessionResponse(BaseModel):
    """Response model for a launcher session."""

    id: str
    name: str
    session: LauncherSessionPayload
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LauncherCaptureRequest(BaseModel):
    """Request to capture (bounce) a launcher session to audio."""

    active_clips: dict[str, str | None] | None = Field(default=None, alias="activeClips")


class LauncherCaptureResponse(BaseModel):
    """Response from a launcher session capture."""

    audio_path: str
    filename: str
    duration_s: float
    sample_rate: int
