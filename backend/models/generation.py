"""
Generation models — voice generation requests, responses, history, and settings.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .effects import EffectConfig


class GenerationRequest(BaseModel):
    """Request model for voice generation."""

    profile_id: str
    text: str = Field(..., min_length=1, max_length=50000)
    language: str = Field(
        default="en", pattern="^(zh|en|ja|ko|de|fr|ru|pt|es|it|he|ar|da|el|fi|hi|ms|nl|no|pl|sv|sw|tr)$"
    )
    seed: int | None = Field(None, ge=0)
    model_size: str | None = Field(
        default=None,
        pattern="^(1\\.7B|0\\.6B|0\\.5B|small|mini)$",
        description="Model size for engines with multiple checkpoints (e.g. fish_speech '0.5B', f5_tts 'small', kitten_tts 'mini').",
    )
    instruct: str | None = Field(None, max_length=500)
    engine: str | None = Field(
        default=None,
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos_gguf|parler_tts_gguf|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
    )
    temperature: float | None = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature (0.0-2.0). None uses the engine default.",
    )
    use_cloud: bool = Field(
        default=False,
        description="Route TTS through the default BYOK cloud provider (if configured) instead of the local model.",
    )
    personality: bool = Field(
        default=False,
        description="When true and the profile has a personality prompt, the input text is rewritten in-character before TTS.",
    )
    max_chunk_chars: int = Field(
        default=800, ge=100, le=5000, description="Max characters per chunk for long text splitting"
    )
    crossfade_ms: int = Field(
        default=50, ge=0, le=500, description="Crossfade duration in ms between chunks (0 for hard cut)"
    )
    normalize: bool = Field(default=True, description="Normalize output audio volume")
    effects_chain: list[EffectConfig] | None = Field(
        None, description="Effects chain to apply after generation (overrides profile default)"
    )
    emotion: str | None = Field(
        default=None,
        description="Emotion preset to apply via DSP post-processing (e.g. 'happy', 'sad', 'angry', 'calm', 'excited', 'fearful', 'surprised', 'disgusted', 'neutral', 'whisper', 'shout')",
    )
    voice_clean: bool = Field(
        default=False,
        description="Apply the Phase 1 TTS enhancer chain (denoise -> de-ess -> warmth EQ -> dynamics) after synthesis.",
    )
    streaming: bool = Field(
        default=False,
        description="Enable streaming playback: save each chunk to disk and emit chunk_ready SSE events as they complete.",
    )


class GenerationVersionResponse(BaseModel):
    """Response model for a generation version."""

    id: str
    generation_id: str
    label: str
    audio_path: str
    effects_chain: list[EffectConfig] | None = None
    source_version_id: str | None = None
    is_default: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GenerationResponse(BaseModel):
    """Response model for voice generation."""

    id: str
    profile_id: str
    text: str
    language: str
    audio_path: str | None = None
    duration: float | None = None
    seed: int | None = None
    instruct: str | None = None
    engine: str | None = "kokoro"
    model_size: str | None = None
    status: str = "completed"
    error: str | None = None
    is_favorited: bool = False
    source: str = "manual"
    created_at: datetime
    versions: list[GenerationVersionResponse] | None = None
    active_version_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class HistoryQuery(BaseModel):
    """Query model for generation history."""

    profile_id: str | None = None
    search: str | None = None
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class HistoryResponse(BaseModel):
    """Response model for history entry (includes profile name)."""

    id: str
    profile_id: str
    profile_name: str
    text: str
    language: str
    audio_path: str | None = None
    duration: float | None = None
    seed: int | None = None
    instruct: str | None = None
    engine: str | None = "kokoro"
    model_size: str | None = None
    status: str = "completed"
    error: str | None = None
    is_favorited: bool = False
    created_at: datetime
    versions: list[GenerationVersionResponse] | None = None
    active_version_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class HistoryListResponse(BaseModel):
    """Response model for history list."""

    items: list[HistoryResponse]
    total: int


class GenerationSettingsResponse(BaseModel):
    """Server-persisted defaults for the generation flow."""

    max_chunk_chars: int = Field(default=800, ge=100, le=5000)
    crossfade_ms: int = Field(default=50, ge=0, le=500)
    normalize_audio: bool = True
    autoplay_on_generate: bool = True
    audio_tags_enabled: bool = False
    preload_on_start: bool = True

    model_config = ConfigDict(from_attributes=True)


class GenerationSettingsUpdate(BaseModel):
    """Partial update for generation settings — every field is optional."""

    max_chunk_chars: int | None = Field(default=None, ge=100, le=5000)
    crossfade_ms: int | None = Field(default=None, ge=0, le=500)
    normalize_audio: bool | None = None
    autoplay_on_generate: bool | None = None
    audio_tags_enabled: bool | None = None
    preload_on_start: bool | None = None


class ActiveGenerationTask(BaseModel):
    """Response model for active generation task."""

    task_id: str
    profile_id: str
    text_preview: str
    started_at: datetime


class ActiveDownloadTask(BaseModel):
    """Response model for active download task."""

    model_name: str
    status: str
    started_at: datetime
    error: str | None = None
    progress: float | None = None  # 0-100 percentage
    current: int | None = None  # bytes downloaded
    total: int | None = None  # total bytes
    filename: str | None = None  # current file being downloaded


class ActiveTasksResponse(BaseModel):
    """Response model for active tasks."""

    downloads: list[ActiveDownloadTask]
    generations: list[ActiveGenerationTask]
