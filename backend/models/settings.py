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
