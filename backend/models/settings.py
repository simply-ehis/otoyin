"""
Settings models — assistant, performance, and MCP client binding configuration.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AssistantSettingsResponse(BaseModel):
    """Server-persisted agent/LLM preferences.

    ``context_tokens`` / ``max_tokens`` are ``None`` when the user has not
    overridden the RAM-aware default; the backend computes the effective
    value from model size + total RAM in that case.
    """

    model_size: str = "4B-Q4_K_M"
    context_tokens: int | None = None
    max_tokens: int | None = None
    agent_memory_enabled: bool = True
    thinking_enabled: bool = False
    system_prompt: str | None = None
    kv_quant: str = "q8_0"
    # Layers offloaded to GPU (None = CPU-only). Applies at planner load.
    gpu_layers: int | None = None
    # MoE (Mixture of Experts) streaming — when set, passes
    # --moe-stream-cache <N>G to llama-server for SSD-based expert weight
    # streaming. None = disabled (dense models). Value is in GB.
    moe_stream_cache_gb: int | None = None
    # O_DIRECT bypass for MoE expert reads (avoids page-cache pollution).
    moe_stream_direct: bool = False
    # Live planner state (not persisted): n_ctx/kv_quant/gpu_layers only take effect
    # when the llama-server (re)loads, so the UI can tell the user a reload
    # is pending instead of pretending "saved" means "active".
    planner_loaded: bool = False
    loaded_n_ctx: int | None = None
    loaded_model_size: str | None = None
    effective_n_ctx: int | None = None
    loaded_kv_quant: str | None = None
    loaded_gpu_layers: int | None = None
    effective_gpu_layers: int | None = None
    # True when TWENTYLABS_LLAMA_GPU_LAYERS is set — the env wins over the UI.
    gpu_layers_env_override: bool = False

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
    gpu_layers: int | None = Field(default=None, ge=0, le=999)
    moe_stream_cache_gb: int | None = Field(default=None, ge=0, le=64)
    moe_stream_direct: bool | None = None


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


class ServerPortResponse(BaseModel):
    """Serving port state: what the backend bound, what is persisted for
    the next boot, and whether a restart is needed to apply a change."""

    port: int
    current_port: int
    needs_restart: bool


class ServerPortUpdate(BaseModel):
    """Persisted serving port. Privileged ports (<1024) are rejected;
    the port only takes effect after a backend restart."""

    port: int = Field(ge=1024, le=65535)


class MCPClientBindingResponse(BaseModel):
    """Per-MCP-client voice binding — what voice / engine the server should
    use when a given client_id calls 21labs.speak without args, plus an
    opt-in personality-rewrite default."""

    client_id: str
    label: str | None = None
    profile_id: str | None = None
    default_engine: str | None = Field(
        None,
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos_gguf|parler_tts_gguf|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
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
        pattern="^(kokoro|fish_speech|fish_speech_s2|zonos_gguf|parler_tts_gguf|styletts2|chattts|f5_tts|pocket_tts|moss_tts_nano|kitten_tts|neutts|neutts_2e|orpheus|qwen3_tts|bark_small|cloud)$",
    )
    default_personality: bool = False


class MCPClientBindingListResponse(BaseModel):
    items: list[MCPClientBindingResponse]
