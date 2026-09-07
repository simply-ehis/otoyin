"""
Voice profile models — create, update, and query voice profiles and samples.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .effects import EffectConfig


class VoiceProfileCreate(BaseModel):
    """Request model for creating a voice profile."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    language: str = Field(
        default="en", pattern="^(zh|en|ja|ko|de|fr|ru|pt|es|it|he|ar|da|el|fi|hi|ms|nl|no|pl|sv|sw|tr)$"
    )
    voice_type: str | None = Field(default="cloned", pattern="^(cloned|preset|designed)$")
    preset_engine: str | None = Field(None, max_length=50)
    preset_voice_id: str | None = Field(None, max_length=100)
    design_prompt: str | None = Field(None, max_length=2000)
    voice_attributes: dict | None = Field(
        None, description="Structured voice design attributes (gender, age, accent, tone, style, pacing)"
    )
    default_engine: str | None = Field(None, max_length=50)
    personality: str | None = Field(None, max_length=2000)


class VoiceProfileResponse(BaseModel):
    """Response model for voice profile."""

    id: str
    name: str
    description: str | None
    language: str
    avatar_path: str | None = None
    effects_chain: list[EffectConfig] | None = None
    voice_type: str = "cloned"
    preset_engine: str | None = None
    preset_voice_id: str | None = None
    design_prompt: str | None = None
    voice_attributes: dict | None = None
    default_engine: str | None = None
    personality: str | None = None
    generation_count: int = 0
    sample_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProfileSampleCreate(BaseModel):
    """Request model for adding a sample to a profile."""

    reference_text: str = Field(..., min_length=1, max_length=1000)


class ProfileSampleUpdate(BaseModel):
    """Request model for updating a profile sample."""

    reference_text: str = Field(..., min_length=1, max_length=1000)


class ProfileSampleResponse(BaseModel):
    """Response model for profile sample."""

    id: str
    profile_id: str
    audio_path: str
    reference_text: str

    model_config = ConfigDict(from_attributes=True)


class VoiceConvertResponse(BaseModel):
    """Response model for RVC voice conversion."""

    audio_path: str
    sample_rate: int
    voice_name: str
    pitch_shift: int
