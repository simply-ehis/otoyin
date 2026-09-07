"""
Effects chain models — effect configuration, presets, and available effects.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EffectConfig(BaseModel):
    """A single effect in an effects chain."""

    type: str
    enabled: bool = True
    params: dict = Field(default_factory=dict)


class EffectsChain(BaseModel):
    """An ordered list of effects to apply."""

    effects: list[EffectConfig] = Field(default_factory=list)


class EffectPresetCreate(BaseModel):
    """Request model for creating an effect preset."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    effects_chain: list[EffectConfig]


class EffectPresetUpdate(BaseModel):
    """Request model for updating an effect preset."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    effects_chain: list[EffectConfig] | None = None


class EffectPresetResponse(BaseModel):
    """Response model for effect preset."""

    id: str
    name: str
    description: str | None = None
    effects_chain: list[EffectConfig]
    is_builtin: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApplyEffectsRequest(BaseModel):
    """Request to apply effects to an existing generation."""

    effects_chain: list[EffectConfig]
    source_version_id: str | None = Field(
        None, description="Version to use as source audio (defaults to clean/original)"
    )
    label: str | None = Field(None, max_length=100, description="Label for this version (auto-generated if omitted)")
    set_as_default: bool = Field(default=True, description="Set this version as the default")


class ProfileEffectsUpdate(BaseModel):
    """Request to update the default effects chain on a profile."""

    effects_chain: list[EffectConfig] | None = Field(None, description="Effects chain (null to remove)")


class AvailableEffectParam(BaseModel):
    """Description of a single effect parameter."""

    default: float
    min: float
    max: float
    step: float
    description: str


class AvailableEffect(BaseModel):
    """Description of an available effect type."""

    type: str
    label: str
    description: str
    params: dict  # param_name -> AvailableEffectParam


class AvailableEffectsResponse(BaseModel):
    """Response listing all available effect types."""

    effects: list[AvailableEffect]
