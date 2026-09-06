"""
Pydantic models for request/response validation.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

try:
    from .utils.capture_chords import (
        default_push_to_talk_chord,
        default_toggle_to_talk_chord,
    )
except ImportError:
    from utils.capture_chords import (
        default_push_to_talk_chord,
        default_toggle_to_talk_chord,
    )


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
    effects_chain: list["EffectConfig"] | None = None
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
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|parler_tts|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
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
    effects_chain: list["EffectConfig"] | None = Field(
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
    versions: list["GenerationVersionResponse"] | None = None
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
    versions: list["GenerationVersionResponse"] | None = None
    active_version_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class HistoryListResponse(BaseModel):
    """Response model for history list."""

    items: list[HistoryResponse]
    total: int


class TranscriptionRequest(BaseModel):
    """Request model for audio transcription."""

    language: str | None = Field(None, pattern="^(en|zh|ja|ko|de|fr|ru|pt|es|it)$")
    model: str | None = Field(None, pattern="^(tiny\\.en|base\\.en|cloud)$")


class TranscriptionResponse(BaseModel):
    """Response model for transcription."""

    text: str
    duration: float
    segments: list[dict] = []


class DiarizationSegment(BaseModel):
    """A speaker-tagged transcript segment."""

    start: float
    end: float
    text: str
    speaker: str


class DiarizationResponse(BaseModel):
    """Response model for speaker diarization."""

    text: str
    duration: float
    segments: list[DiarizationSegment]
    speakers: list[str]
    diarized: bool
    language: str | None = None
    model: str | None = None


class SubtitleSegment(BaseModel):
    """A single subtitle segment with timing."""

    start: float
    end: float
    text: str


class SubtitleStyle(BaseModel):
    """Styling options for ASS subtitle export."""

    font_family: str = "Arial"
    font_size: int = 48
    primary_color: str = "&H00FFFFFF"
    outline_color: str = "&H00000000"
    background_color: str = "&H80000000"
    position: str = "bottom"
    outline_width: int = 2
    shadow: int = 1
    margin_v: int = 30
    bold: bool = False
    italic: bool = False


class VoiceConvertResponse(BaseModel):
    """Response model for RVC voice conversion."""

    audio_path: str
    sample_rate: int
    voice_name: str
    pitch_shift: int


class RefinementFlagsModel(BaseModel):
    """Boolean toggles that drive the refinement prompt builder."""

    smart_cleanup: bool = True
    self_correction: bool = True
    preserve_technical: bool = True


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
    llm_model: str = Field(default="0.6B", pattern="^(0\\.6B|1\\.7B|4B)$")
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


class AssistantSettingsResponse(BaseModel):
    """Server-persisted agent/LLM preferences.

    ``context_tokens`` / ``max_tokens`` are ``None`` when the user has not
    overridden the RAM-aware default; the backend computes the effective
    value from model size + total RAM in that case.
    """

    model_size: str = "2B-Q4_K_M"
    context_tokens: int | None = None
    max_tokens: int | None = None
    agent_memory_enabled: bool = True
    thinking_enabled: bool = False
    system_prompt: str | None = None
    kv_quant: str = "q8_0"

    model_config = ConfigDict(from_attributes=True)


class AssistantSettingsUpdate(BaseModel):
    """Partial update for assistant settings — every field is optional.

    Token values are clamped to [2048, 32768]; ``None`` clears an override so
    the RAM-aware default applies again.
    """

    model_size: str | None = None
    context_tokens: int | None = Field(default=None, ge=2048, le=262144)
    max_tokens: int | None = Field(default=None, ge=2048, le=262144)
    agent_memory_enabled: bool | None = None
    thinking_enabled: bool | None = None
    system_prompt: str | None = None
    kv_quant: str | None = None


class PerformanceSettingsResponse(BaseModel):
    """Global speed-vs-memory mode.

    When ``performance_mode`` is True the app trades RAM for speed: models stay
    loaded (no idle-unload) and the frontend renders all list items immediately.
    """

    performance_mode: bool = False
    per_engine_keepalive: dict[str, bool] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class PerformanceSettingsUpdate(BaseModel):
    """Partial update for performance settings — every field is optional."""

    performance_mode: bool | None = None
    per_engine_keepalive: dict[str, bool] | None = Field(default=None)


class MCPClientBindingResponse(BaseModel):
    """Per-MCP-client voice binding — what voice / engine the server should
    use when a given client_id calls 21labs.speak without args, plus an
    opt-in personality-rewrite default."""

    client_id: str
    label: str | None = None
    profile_id: str | None = None
    default_engine: str | None = Field(
        None,
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|parler_tts|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
    )
    default_personality: bool = False
    last_seen_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MCPClientBindingUpsert(BaseModel):
    """Create or update a binding. Matched by ``client_id``."""

    client_id: str = Field(..., min_length=1, max_length=64)
    label: str | None = Field(None, max_length=128)
    profile_id: str | None = None
    default_engine: str | None = Field(
        None,
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|parler_tts|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
    )
    default_personality: bool = False


class MCPClientBindingListResponse(BaseModel):
    items: list[MCPClientBindingResponse]


class SpeakRequest(BaseModel):
    """Body for POST /speak — non-MCP REST surface that mirrors 21labs.speak."""

    text: str = Field(..., min_length=1, max_length=10000)
    profile: str | None = Field(
        None,
        description="Voice profile name or id. Falls back to per-client binding, then default.",
    )
    engine: str | None = Field(
        None,
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|parler_tts|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
    )
    personality: bool | None = Field(
        None,
        description="When true and the profile has a personality prompt, the input text is rewritten in-character before TTS. When null, the per-client binding's default_personality flag decides.",
    )
    language: str | None = Field(
        None,
        pattern="^(zh|en|ja|ko|de|fr|ru|pt|es|it|he|ar|da|el|fi|hi|ms|nl|no|pl|sv|sw|tr)$",
    )


class LLMGenerateRequest(BaseModel):
    """Request model for LLM text generation."""

    prompt: str = Field(..., min_length=1, max_length=50000)
    system: str | None = Field(None, max_length=4000)
    model_size: str | None = Field(
        default="2B-Q4_K_M", pattern="^(2B-Q4_K_M|0\\.8B-Q5_K_M|4B-v3-Q4_K_M|3B-Reasoning-Q4_K_M)$"
    )
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    # Few-shot (user, assistant) pairs prepended as real chat turns.
    # Used by the refinement service to pin tricky rules (imperatives
    # staying imperatives, technical-term punctuation) that small models
    # lose when the examples live inline in the system prompt.
    examples: list[list[str]] | None = Field(default=None, max_length=8)


class LLMGenerateResponse(BaseModel):
    """Response model for LLM text generation."""

    text: str
    model_size: str


# ── Profile personality endpoint ──────────────────────────────────────
# The sole standalone personality endpoint is ``/profiles/{id}/compose``,
# which produces a fresh in-character utterance the UI drops into the
# generate textarea. Rewrite is now reached via ``/generate`` with
# ``personality=true``.


class PersonalityTextResponse(BaseModel):
    """Response returned by the ``/profiles/{id}/compose`` endpoint."""

    text: str
    model_size: str


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


class HealthSubsystem(BaseModel):
    """Status of a single subsystem."""

    name: str
    healthy: bool
    detail: str | None = None


class HealthResponse(BaseModel):
    """Response model for health check."""

    status: str
    model_loaded: bool
    model_downloaded: bool | None = None  # Whether model is cached/downloaded
    model_size: str | None = None  # Current model size if loaded
    gpu_available: bool
    gpu_type: str | None = None  # GPU type (CUDA, MPS, or None)
    vram_used_mb: float | None = None
    vram_total_mb: float | None = None  # Total GPU VRAM in MB
    vram_free_mb: float | None = None  # Free GPU VRAM in MB
    vram_pressure: bool | None = None  # True if VRAM below safe threshold
    backend_type: str | None = None  # Backend type (onnx or pytorch)
    backend_variant: str | None = None  # Binary variant (cpu or cuda)
    gpu_compatibility_warning: str | None = None  # Warning if GPU arch unsupported
    subsystems: list[HealthSubsystem] = []


class DirectoryCheck(BaseModel):
    """Health status for a single directory."""

    path: str
    exists: bool
    writable: bool
    error: str | None = None


class FilesystemHealthResponse(BaseModel):
    """Response model for filesystem health check."""

    healthy: bool
    disk_free_mb: float | None = None
    disk_total_mb: float | None = None
    directories: list[DirectoryCheck]


class PresetVoice(BaseModel):
    """A single preset voice entry for models that ship with built-in voices."""

    id: str  # e.g. "af_heart", "Vivian"
    name: str  # Display name e.g. "Heart", "Vivian"
    gender: str | None = None  # "female", "male", or None
    language: str | None = None  # primary language code


class ModelStatus(BaseModel):
    """Response model for model status."""

    model_name: str
    display_name: str
    engine: str | None = None  # backend engine key (e.g. "zonos")
    hf_repo_id: str | None = None  # HuggingFace repository ID
    downloaded: bool
    downloading: bool = False  # True if download is in progress
    size_mb: float | None = None
    loaded: bool = False
    gpu_only: bool = False  # requires CUDA GPU; unsupported on CPU/edge hosts
    # Capability flags — drive the engine-unique UI (clone / emotion / tags / design / editing)
    clone_voice: bool = False
    emotion_control: bool = False
    supports_instruct: bool = False  # instruct prompt drives delivery
    paralinguistic_tags: bool = False
    voice_design: bool = False
    supports_editing: bool = False
    supported_tags: list[str] = Field(default_factory=list)  # e.g. ["[laugh]", "[cough]"]
    # Preset voices — populated for models with built-in voice presets (Kokoro, KittenTTS)
    preset_voices: list[PresetVoice] = Field(default_factory=list)
    supports_voice_mixing: bool = False  # True for Kokoro (42 voices can be blended)
    # Quality scoring (0-10) — reflects capability, quality, and value within
    # the model's category.  10 = best-in-class; scores are per-category so
    # TTS scores are only compared against other TTS models, etc.
    quality_score: int = 0  # 0-10
    category: str = "tts"  # tts | stt | llm | music | sfx | vc
    # Entitlement = this install has a manifest row for the model (downloaded via the
    # Models page). The UI uses this to decide what's selectable/visible in the
    # generation panel; the backend enforces it independently at load time.
    entitled: bool = True


class ModelStatusListResponse(BaseModel):
    """Response model for model status list."""

    models: list[ModelStatus]


class ModelDownloadRequest(BaseModel):
    """Request model for triggering model download."""

    model_name: str


class ModelMigrateRequest(BaseModel):
    """Request model for migrating models to a new directory."""

    destination: str


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


class ActiveGenerationTask(BaseModel):
    """Response model for active generation task."""

    task_id: str
    profile_id: str
    text_preview: str
    started_at: datetime


class ActiveTasksResponse(BaseModel):
    """Response model for active tasks."""

    downloads: list[ActiveDownloadTask]
    generations: list[ActiveGenerationTask]


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


class StoryCreate(BaseModel):
    """Request model for creating a story."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class StoryResponse(BaseModel):
    """Response model for story (list view)."""

    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class StoryItemDetail(BaseModel):
    """Detail model for story item with generation info."""

    id: str
    story_id: str
    generation_id: str
    version_id: str | None = None
    start_time_ms: int
    track: int = 0
    trim_start_ms: int = 0
    trim_end_ms: int = 0
    created_at: datetime
    # Generation details
    profile_id: str
    profile_name: str
    text: str
    language: str
    audio_path: str
    duration: float
    seed: int | None
    instruct: str | None
    engine: str | None = None
    volume: float = 1.0
    fade_in_ms: int = 0
    fade_out_ms: int = 0
    gain_db: float = 0.0
    pan: float = 0.0
    speed: float = 1.0
    generation_created_at: datetime
    # Versions available for this generation
    versions: list["GenerationVersionResponse"] | None = None
    active_version_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class StoryDetailResponse(BaseModel):
    """Response model for story with items."""

    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    items: list[StoryItemDetail] = []

    model_config = ConfigDict(from_attributes=True)


class StoryItemCreate(BaseModel):
    """Request model for adding a generation to a story."""

    generation_id: str
    start_time_ms: int | None = None  # If not provided, will be calculated automatically
    track: int | None = 0  # Track number (0 = main track)
    pan: float = 0.0  # Stereo position: -1.0 (full left) … 0.0 (center) … 1.0 (full right)


class StoryItemPanUpdate(BaseModel):
    """Request model for setting a story item's stereo pan position."""

    pan: float = Field(..., ge=-1.0, le=1.0)


class StoryItemUpdateTime(BaseModel):
    """Request model for updating a story item's timecode."""

    generation_id: str
    start_time_ms: int = Field(..., ge=0)


class StoryItemBatchUpdate(BaseModel):
    """Request model for batch updating story item timecodes."""

    updates: list[StoryItemUpdateTime]


class StoryItemReorder(BaseModel):
    """Request model for reordering story items."""

    generation_ids: list[str] = Field(..., min_length=1)


class StoryItemMove(BaseModel):
    """Request model for moving a story item (position and/or track)."""

    start_time_ms: int = Field(..., ge=0)
    track: int = 0


class StoryItemTrim(BaseModel):
    """Request model for trimming a story item."""

    trim_start_ms: int = Field(..., ge=0)
    trim_end_ms: int = Field(..., ge=0)


class StoryItemSplit(BaseModel):
    """Request model for splitting a story item."""

    split_time_ms: int = Field(..., ge=0)  # Time within the clip to split at (relative to clip start)


class StoryItemVersionUpdate(BaseModel):
    """Request model for setting a story item's pinned version."""

    version_id: str | None = None  # null = use generation default


class StoryItemVolumeUpdate(BaseModel):
    """Request model for adjusting a story item's playback volume.

    Linear gain. ``1.0`` is the original level, ``0.0`` is silent. Capped
    above 1.0 so a too-aggressive boost can't blow out the mix or clip
    the export.
    """

    volume: float = Field(..., ge=0.0, le=2.0)


class StoryItemFade(BaseModel):
    """Request model for setting fade-in and fade-out durations."""

    fade_in_ms: int = Field(..., ge=0)
    fade_out_ms: int = Field(..., ge=0)


class StoryItemGain(BaseModel):
    """Request model for applying gain in dB to a story item."""

    gain_db: float = Field(..., ge=-24.0, le=24.0)


class StoryItemNormalize(BaseModel):
    """Request model for normalizing a story item to a target LUFS level."""

    target_lufs: float = Field(default=-14.0, ge=-30.0, le=0.0)


class StoryItemMerge(BaseModel):
    """Request model for merging two adjacent story items into one."""

    first_item_id: str
    second_item_id: str


class StoryItemSpeed(BaseModel):
    """Request model for non-destructive per-item playback speed.

    ``1.0`` is original speed; ``> 1`` plays faster (shorter), ``< 1``
    slower (longer), applied at mix time with constant pitch.
    """

    speed: float = Field(..., ge=0.25, le=4.0)


class StoryMatchLoudness(BaseModel):
    """Request model for matching every item in a story to one loudness."""

    target_lufs: float = Field(default=-16.0, ge=-30.0, le=0.0)


class StoryItemCrossfade(BaseModel):
    """Request model for an overlap crossfade into the next item.

    Sets this item's fade-out, the next item's fade-in, and overlaps the
    next item's start by ``duration_ms`` so they blend instead of abutting.
    """

    next_item_id: str
    duration_ms: int = Field(..., ge=50, le=10000)


class StoryItemMoveToStory(BaseModel):
    """Request model for moving (or copying) an item into another story."""

    target_story_id: str
    as_copy: bool = False


class SongDraftPayload(BaseModel):
    """Songwriter draft body (mirrors Resonant's SongwritingDraft)."""

    model_config = ConfigDict(populate_by_name=True)

    language: str = "en"
    title: str = ""
    idea: str = ""
    hook: str = ""
    point_of_view: str = Field(default="first-person", alias="pointOfView")
    tense: str = "present"
    mood: str = ""
    genre: str = ""
    audience: str = ""
    imagery: str = ""
    style_prompt: str = Field(default="", alias="stylePrompt")
    lyrics: str = ""


class SongDraftCreate(BaseModel):
    """Request model for creating/updating a songwriter draft."""

    title: str = Field(default="", max_length=200)
    language: str = Field(default="en", max_length=16)
    draft: SongDraftPayload = Field(default_factory=SongDraftPayload)


class SongDraftResponse(BaseModel):
    """Response model for a songwriter draft."""

    id: str
    title: str
    language: str
    draft: SongDraftPayload
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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
