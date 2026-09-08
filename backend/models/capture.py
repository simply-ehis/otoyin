"""
Capture models — dictation capture, refinement, re-transcription, and settings.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .common import RefinementFlagsModel

try:
    from ..utils.capture_chords import (
        default_push_to_talk_chord,
        default_toggle_to_talk_chord,
    )
except ImportError:
    from utils.capture_chords import (
        default_push_to_talk_chord,
        default_toggle_to_talk_chord,
    )


class CaptureResponse(BaseModel):
    """Response model for a capture."""

    id: str
    audio_path: str
    source: str
    language: str | None = None
    duration_ms: int | None = None
    transcript_raw: str
    transcript_refined: str | None = None
    stt_model: str | None = None
    llm_model: str | None = None
    refinement_flags: RefinementFlagsModel | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CaptureListResponse(BaseModel):
    """Response model for paginated capture list."""

    items: list[CaptureResponse]
    total: int


class CaptureCreateResponse(CaptureResponse):
    """
    Response model for ``POST /captures``.

    Adds ``auto_refine`` and ``allow_auto_paste`` — the server-side settings
    captured at the moment the capture was created. The client reads these to
    decide whether to chain a refinement request and whether to fire the
    synthetic-paste pipeline, so it doesn't need a synced local copy of the
    capture_settings table across sibling Tauri webviews.
    """

    auto_refine: bool
    allow_auto_paste: bool


class CaptureRefineRequest(BaseModel):
    """Request to refine a capture's transcript via the LLM."""

    flags: RefinementFlagsModel | None = None
    model_size: str | None = Field(default=None, pattern="^(2B-Q4_K_M|0\\.8B-Q5_K_M|4B-v3-Q4_K_M|3B-Reasoning-Q4_K_M)$")


class CaptureRetranscribeRequest(BaseModel):
    """Request to re-run STT on a capture's audio with a different model."""

    model: str | None = Field(None, pattern="^(tiny\\.en|base\\.en|cloud)$")
    language: str | None = Field(None, pattern="^(en|zh|ja|ko|de|fr|ru|pt|es|it)$")


class CaptureSettingsResponse(BaseModel):
    """Server-persisted defaults for the capture / refine flow."""

    stt_model: str = Field(default="tiny.en", pattern="^(tiny\\.en|base\\.en|cloud)$")
    language: str = Field(default="auto")
    auto_refine: bool = True
    llm_model: str = Field(default="2B-Q4_K_M", pattern="^(0\\.6B|1\\.7B|2B-Q4_K_M|4B)$")
    smart_cleanup: bool = True
    self_correction: bool = True
    preserve_technical: bool = True
    allow_auto_paste: bool = True
    default_playback_voice_id: str | None = None
    hotkey_enabled: bool = False
    chord_push_to_talk_keys: list[str] = Field(default_factory=default_push_to_talk_chord)
    chord_toggle_to_talk_keys: list[str] = Field(default_factory=default_toggle_to_talk_chord)
    # Streaming STT (live dictation) settings
    streaming_stt_model: str = Field(default="tiny.en", pattern="^(tiny\\.en|base\\.en|cloud)$")
    streaming_stt_language: str = Field(default="auto")
    streaming_vad_threshold: float = Field(default=0.02, ge=0.0, le=1.0)

    model_config = ConfigDict(from_attributes=True)


class CaptureSettingsUpdate(BaseModel):
    """Partial update for capture settings — every field is optional."""

    stt_model: str | None = Field(default=None, pattern="^(tiny\\.en|base\\.en|cloud)$")
    language: str | None = None
    auto_refine: bool | None = None
    llm_model: str | None = Field(default=None, pattern="^(0\\.6B|1\\.7B|4B)$")
    smart_cleanup: bool | None = None
    self_correction: bool | None = None
    preserve_technical: bool | None = None
    allow_auto_paste: bool | None = None
    default_playback_voice_id: str | None = None
    hotkey_enabled: bool | None = None
    chord_push_to_talk_keys: list[str] | None = Field(default=None, min_length=1, max_length=6)
    chord_toggle_to_talk_keys: list[str] | None = Field(default=None, min_length=1, max_length=6)
    # Streaming STT (live dictation) settings
    streaming_stt_model: str | None = Field(default=None, pattern="^(tiny\\.en|base\\.en|cloud)$")
    streaming_stt_language: str | None = None
    streaming_vad_threshold: float | None = Field(default=None, ge=0.0, le=1.0)


class ModelReadiness(BaseModel):
    """Per-model entry in the dictation readiness checklist.

    ``model_name`` is the canonical id used by ``POST /models/download`` so the
    frontend can wire a one-click "Download" button without a second lookup.
    ``size`` is the user's chosen variant (e.g. "turbo", "0.6B"); ``display_name``
    is what the checklist row should show ("Whisper Turbo").
    """

    ready: bool
    model_name: str
    display_name: str
    size: str
    size_mb: int | None = None


class CaptureReadinessResponse(BaseModel):
    """Backend gates that must be green before the global hotkey will fire.

    The frontend combines this with its own TCC permission checks (input
    monitoring, accessibility) into the full dictation readiness checklist.
    Hotkey-enabled is the user's intent toggle and lives outside this struct.
    """

    stt: ModelReadiness
    llm: ModelReadiness
