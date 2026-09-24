"""
Health check and model status models — subsystem health, filesystem, and downloads.
"""

from pydantic import BaseModel, Field


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
    ram_total_mb: float | None = None  # Total system RAM in MB
    ram_free_mb: float | None = None  # Free system RAM in MB
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
    quant: str | None = None  # quantization/format tag (e.g. "Q8_0") — technical detail
    model_size: str | None = None  # size variant tag (e.g. "82M", "4B-Q4_K_M")
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
    license_id: str = ""
    license_note: str = ""
    commercial_use: bool = True
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
