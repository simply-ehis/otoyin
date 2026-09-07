"""
Audio studio models — channels, mixer configuration, and export.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .effects import EffectConfig


class AudioChannelCreate(BaseModel):
    """Request model for creating an audio channel."""

    name: str = Field(..., min_length=1, max_length=100)
    device_ids: list[str] = Field(default_factory=list)


class AudioChannelUpdate(BaseModel):
    """Request model for updating an audio channel."""

    name: str | None = Field(None, min_length=1, max_length=100)
    device_ids: list[str] | None = None


class AudioChannelResponse(BaseModel):
    """Response model for audio channel."""

    id: str
    name: str
    is_default: bool
    device_ids: list[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChannelVoiceAssignment(BaseModel):
    """Request model for assigning voices to a channel."""

    profile_ids: list[str]


class ProfileChannelAssignment(BaseModel):
    """Request model for assigning channels to a profile."""

    channel_ids: list[str]


class MixerTrackConfig(BaseModel):
    """Configuration for a single mixer track."""

    id: str
    name: str
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    pan: float = Field(default=0.0, ge=-1.0, le=1.0)
    muted: bool = False
    solo: bool = False
    bus_id: str | None = None
    effects_chain: list[EffectConfig] = Field(default_factory=list)


class MixerBusConfig(BaseModel):
    """Configuration for a mixer bus."""

    id: str
    name: str
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    pan: float = Field(default=0.0, ge=-1.0, le=1.0)
    effects_chain: list[EffectConfig] = Field(default_factory=list)


class MixerState(BaseModel):
    """Full mixer state."""

    tracks: list[MixerTrackConfig] = Field(default_factory=list)
    buses: list[MixerBusConfig] = Field(default_factory=list)
    master_volume: float = Field(default=1.0, ge=0.0, le=2.0)


class MixerExportRequest(BaseModel):
    """Request to export mixed audio."""

    story_id: str
    mixer_state: MixerState
