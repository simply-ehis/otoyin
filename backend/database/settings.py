"""User settings and capture settings models."""

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text

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

from .base import Base


class CaptureSettings(Base):
    """Singleton row holding user defaults for the capture/refine flow.

    Kept server-side so every window, CLI client, and API consumer reads the
    same preferences. The ``id`` column is always 1.
    """

    __tablename__ = "capture_settings"

    id = Column(Integer, primary_key=True, default=1)
    stt_model = Column(String, nullable=False, default="tiny.en")
    language = Column(String, nullable=False, default="auto")
    auto_refine = Column(Boolean, nullable=False, default=True)
    # NOTE: must equal backends.configs.llm.DEFAULT_PLANNER_SIZE (kept as a
    # literal here to avoid an import cycle: configs/__init__ -> utils ->
    # services -> database). backend/tests/test_llm_size_unified.py asserts it.
    llm_model = Column(String, nullable=False, default="Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M")
    smart_cleanup = Column(Boolean, nullable=False, default=True)
    self_correction = Column(Boolean, nullable=False, default=True)
    preserve_technical = Column(Boolean, nullable=False, default=True)
    allow_auto_paste = Column(Boolean, nullable=False, default=True)
    default_playback_voice_id = Column(String, nullable=True)
    # Default OFF — opting in is what triggers the macOS Input Monitoring TCC
    # prompt. We deliberately don't spawn the global keyboard tap until the
    # user flips this on so a fresh-install user doesn't see a scary
    # "otoyin would like to receive keystrokes from any application" dialog
    # before they've even opened the Captures tab.
    hotkey_enabled = Column(Boolean, nullable=False, default=False)
    # Lists of keytap key names (e.g. "MetaRight", "ControlRight"). Right-hand
    # modifiers by default so they don't collide with left-hand shortcuts.
    chord_push_to_talk_keys = Column(JSON, nullable=False, default=default_push_to_talk_chord)
    chord_toggle_to_talk_keys = Column(JSON, nullable=False, default=default_toggle_to_talk_chord)
    # Streaming STT (live dictation) settings
    streaming_stt_model = Column(String, nullable=False, default="tiny.en")
    streaming_stt_language = Column(String, nullable=False, default="auto")
    streaming_vad_threshold = Column(Float, nullable=False, default=0.02)
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AssistantSettings(Base):
    """Singleton row for agent/LLM preferences (context, memory, thinking).

    ``context_tokens`` and ``max_tokens`` default to the RAM-aware value
    computed from the model size + total RAM (see ``utils.llm_context``); a
    user-provided value here overrides that default and is clamped to
    [2048, 32768]. ``model_size`` selects the GGUF planner variant.
    """

    __tablename__ = "assistant_settings"

    id = Column(Integer, primary_key=True, default=1)
    model_size = Column(
        String, nullable=False, default="Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M"
    )  # == DEFAULT_PLANNER_SIZE, see note above
    context_tokens = Column(Integer, nullable=True, default=None)
    max_tokens = Column(Integer, nullable=True, default=None)
    agent_memory_enabled = Column(Boolean, nullable=False, default=True)
    thinking_enabled = Column(Boolean, nullable=False, default=False)
    system_prompt = Column(Text, nullable=True, default=None)
    kv_quant = Column(String, nullable=False, default="q8_0")
    # Layers offloaded to GPU (llama-server -ngl). NULL = CPU-only (0),
    # matching historical behavior. Applies at planner load time.
    gpu_layers = Column(Integer, nullable=True, default=None)
    # MoE (Mixture of Experts) streaming — when set, passes
    # --moe-stream-cache <N>G to llama-server for SSD-based expert weight
    # streaming. NULL = disabled (dense models). Value is in GB.
    moe_stream_cache_gb = Column(Integer, nullable=True, default=None)
    # O_DIRECT bypass for MoE expert reads (avoids page-cache pollution).
    moe_stream_direct = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class PerformanceSettings(Base):
    """Singleton row for the global speed-vs-memory mode.

    When ``performance_mode`` is True the app trades RAM for speed: the
    lifecycle manager stops idle-unloading models (they stay resident) and the
    frontend renders every list item immediately instead of virtualizing.
    """

    __tablename__ = "performance_settings"

    id = Column(Integer, primary_key=True, default=1)
    performance_mode = Column(Boolean, nullable=False, default=False)
    per_engine_keepalive = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
