"""ORM model definitions for the otoyin SQLite database."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase

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


class Base(DeclarativeBase):
    pass


class VoiceProfile(Base):
    """Voice profile.

    voice_type discriminates three flavours:
      - "cloned"   — traditional reference-audio profiles (all cloning engines)
      - "preset"   — engine-specific pre-built voice (e.g. Kokoro voices)
      - "designed"  — text-described voice (future)
    """

    __tablename__ = "profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    description = Column(Text)
    language = Column(String, default="en")
    avatar_path = Column(String, nullable=True)
    effects_chain = Column(Text, nullable=True)

    # Voice type system — added v0.3.x
    voice_type = Column(String, default="cloned")  # "cloned" | "preset" | "designed"
    preset_engine = Column(String, nullable=True)  # e.g. "kokoro" — only for preset
    preset_voice_id = Column(String, nullable=True)  # e.g. "am_adam" — only for preset
    design_prompt = Column(Text, nullable=True)  # text description — only for designed
    voice_attributes = Column(
        Text, nullable=True
    )  # JSON: structured design attributes (gender, age, accent, tone, style, pacing)
    default_engine = Column(String, nullable=True)  # auto-selected engine, locked for preset
    # Free-form character prompt used by the compose button and the
    # personality-rewrite path on /generate. Describes *what* this voice
    # says and how, orthogonal to how it sounds (handled by the preset /
    # cloning metadata above).
    personality = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ProfileSample(Base):
    """Audio sample attached to a voice profile."""

    __tablename__ = "profile_samples"
    __table_args__ = (Index("ix_profile_samples_profile_id", "profile_id"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    profile_id = Column(String, ForeignKey("profiles.id"), nullable=False)
    audio_path = Column(String, nullable=False)
    reference_text = Column(Text, nullable=False)


class Generation(Base):
    """A single TTS generation."""

    __tablename__ = "generations"
    __table_args__ = (
        Index("ix_generations_profile_id", "profile_id"),
        Index("ix_generations_status", "status"),
        Index("ix_generations_created_at", "created_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    profile_id = Column(String, ForeignKey("profiles.id"), nullable=False)
    text = Column(Text, nullable=False)
    language = Column(String, default="en")
    audio_path = Column(String, nullable=True)
    duration = Column(Float, nullable=True)
    seed = Column(Integer)
    instruct = Column(Text)
    engine = Column(String, default="")
    model_size = Column(String, nullable=True)
    temperature = Column(Float, nullable=True)
    status = Column(String, default="completed")
    error = Column(Text, nullable=True)
    is_favorited = Column(Boolean, default=False)
    # Origin of this generation — "manual" for plain /generate calls,
    # "personality_speak" for rows whose text was rewritten through the
    # profile's personality LLM before TTS. Future sources (bulk import,
    # agent replies, etc.) can extend this.
    source = Column(String, nullable=False, default="manual")
    # When True, this generation was routed through the default BYOK cloud TTS
    # provider instead of a local model. Persisted so retry/regenerate reuse it.
    use_cloud = Column(Boolean, default=False)
    # When True, the Phase 1 TTS enhancer chain (denoise -> de-ess -> warmth
    # EQ -> dynamics) ran on the output after synthesis. Persisted so
    # retry/regenerate reuse it.
    voice_clean = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class Story(Base):
    """A story that sequences multiple generations."""

    __tablename__ = "stories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class StoryItem(Base):
    """Links a generation to a story at a specific timecode."""

    __tablename__ = "story_items"
    __table_args__ = (
        Index("ix_story_items_story_id", "story_id"),
        Index("ix_story_items_generation_id", "generation_id"),
        Index("ix_story_items_story_track", "story_id", "track"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    story_id = Column(String, ForeignKey("stories.id"), nullable=False)
    generation_id = Column(String, ForeignKey("generations.id"), nullable=False)
    version_id = Column(String, ForeignKey("generation_versions.id"), nullable=True)
    start_time_ms = Column(Integer, nullable=False, default=0)
    track = Column(Integer, nullable=False, default=0)
    trim_start_ms = Column(Integer, nullable=False, default=0)
    trim_end_ms = Column(Integer, nullable=False, default=0)
    volume = Column(Float, nullable=False, default=1.0)
    fade_in_ms = Column(Integer, nullable=False, default=0)
    fade_out_ms = Column(Integer, nullable=False, default=0)
    gain_db = Column(Float, nullable=False, default=0.0)
    pan = Column(Float, nullable=False, default=0.0)
    speed = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class StoryEditSnapshot(Base):
    """Undo/redo snapshots for a story's item list.

    Before each item mutation the service pushes the current items JSON to
    the undo stack; undo restores a snapshot and moves the present state to
    the redo stack. Both stacks are pruned to HISTORY_LIMIT entries.
    """

    __tablename__ = "story_edit_snapshots"
    __table_args__ = (Index("ix_story_edit_snapshots_story", "story_id", "stack"),)

    HISTORY_LIMIT = 50

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    story_id = Column(String, ForeignKey("stories.id"), nullable=False)
    stack = Column(String, nullable=False, default="undo")  # "undo" | "redo"
    items_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class Project(Base):
    """Audio studio project (JSON blob)."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    data = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class GenerationVersion(Base):
    """A version of a generation's audio (original, processed, alternate takes)."""

    __tablename__ = "generation_versions"
    __table_args__ = (Index("ix_generation_versions_generation_id", "generation_id"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    generation_id = Column(String, ForeignKey("generations.id"), nullable=False)
    label = Column(String, nullable=False)
    audio_path = Column(String, nullable=False)
    effects_chain = Column(Text, nullable=True)
    source_version_id = Column(String, ForeignKey("generation_versions.id"), nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class EffectPreset(Base):
    """Saved effect chain preset."""

    __tablename__ = "effect_presets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    effects_chain = Column(Text, nullable=False)
    is_builtin = Column(Boolean, default=False)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class AudioChannel(Base):
    """Audio output channel (bus)."""

    __tablename__ = "audio_channels"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ChannelDeviceMapping(Base):
    """Mapping between a channel and an OS audio device."""

    __tablename__ = "channel_device_mappings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    channel_id = Column(String, ForeignKey("audio_channels.id"), nullable=False)
    device_id = Column(String, nullable=False)


class ProfileChannelMapping(Base):
    """Many-to-many mapping between voice profiles and audio channels."""

    __tablename__ = "profile_channel_mappings"

    profile_id = Column(String, ForeignKey("profiles.id"), primary_key=True)
    channel_id = Column(String, ForeignKey("audio_channels.id"), primary_key=True)


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
    llm_model = Column(String, nullable=False, default="2B-Q4_K_M")
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


class GenerationSettings(Base):
    """Singleton row for long-form TTS generation preferences."""

    __tablename__ = "generation_settings"

    id = Column(Integer, primary_key=True, default=1)
    max_chunk_chars = Column(Integer, nullable=False, default=800)
    crossfade_ms = Column(Integer, nullable=False, default=50)
    normalize_audio = Column(Boolean, nullable=False, default=True)
    autoplay_on_generate = Column(Boolean, nullable=False, default=True)
    audio_tags_enabled = Column(Boolean, nullable=False, default=False)
    # Warm-start preload of the cached Kokoro ONNX engine. Opt-in gate so a
    # fresh install never assumes a default engine; only a cached model is
    # preloaded and only when the user leaves this enabled.
    preload_on_start = Column(Boolean, nullable=False, default=True)
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
    model_size = Column(String, nullable=False, default="2B-Q4_K_M")
    context_tokens = Column(Integer, nullable=True, default=None)
    max_tokens = Column(Integer, nullable=True, default=None)
    agent_memory_enabled = Column(Boolean, nullable=False, default=True)
    thinking_enabled = Column(Boolean, nullable=False, default=False)
    system_prompt = Column(Text, nullable=True, default=None)
    kv_quant = Column(String, nullable=False, default="q8_0")
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


class MCPClientBinding(Base):
    """Per-MCP-client settings (voice profile, engine, personality default).

    Lets users bind distinct voices to distinct agents — e.g. Claude Code
    speaks in "Morgan," Cursor in "Scarlett." The MCP client identifies
    itself via the ``X-21labs-Client-Id`` HTTP header; direct-HTTP
    clients set it in their MCP config's ``headers`` block, the stdio
    shim forwards it from the ``TWENTYONE_LABS_CLIENT_ID`` env var.
    """

    __tablename__ = "mcp_client_bindings"

    client_id = Column(String, primary_key=True)
    label = Column(String, nullable=True)  # display name
    profile_id = Column(String, ForeignKey("profiles.id"), nullable=True)
    default_engine = Column(String, nullable=True)
    # When true, 21labs.speak routes through the profile's personality LLM
    # (rewrite) before TTS by default. Callers can still override per call.
    default_personality = Column(Boolean, nullable=False, default=False)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ModelProvider(Base):
    """User-supplied (BYOK) cloud model provider, arbitrary endpoint.

    True BYOK: any OpenAI-compatible (or provider-specific) base URL plus a
    key. Not a curated provider list. ``domain`` scopes where it is usable
    (tts, music, sfx, vc, llm). The API key is stored encrypted at rest via
    ``utils.secret_store``; only the ciphertext lives in this column.
    """

    __tablename__ = "model_providers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    domain = Column(String, nullable=False, default="llm")  # tts|music|sfx|vc|llm|stt
    name = Column(String, nullable=False)
    base_url = Column(String, nullable=False)
    model = Column(String, nullable=True)  # model id hint for this provider
    encrypted_api_key = Column(Text, nullable=False, default="")
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ADRSession(Base):
    """A named ADR session containing dialogue lines for replacement."""

    __tablename__ = "adr_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    fps = Column(Float, nullable=False, default=24.0)
    guide_audio_path = Column(String, nullable=True)
    guide_duration_ms = Column(Float, nullable=True, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ADRLine(Base):
    """A single dialogue line within an ADR session."""

    __tablename__ = "adr_lines"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("adr_sessions.id"), nullable=False)
    line_index = Column(Integer, nullable=False, default=0)
    original_text = Column(Text, nullable=False)
    character = Column(String, nullable=False)
    target_duration_ms = Column(Float, nullable=True, default=0.0)
    timecode_in = Column(String, nullable=True, default="")
    timecode_out = Column(String, nullable=True, default="")
    selected_take_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ADRTake(Base):
    """A recorded take for a dialogue line."""

    __tablename__ = "adr_takes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    line_id = Column(String, ForeignKey("adr_lines.id"), nullable=False)
    take_number = Column(Integer, nullable=False)
    audio_path = Column(String, nullable=False)
    duration_ms = Column(Float, nullable=True, default=0.0)
    quality_score = Column(Float, nullable=True, default=0.0)
    alignment_offset_ms = Column(Float, nullable=True, default=0.0)
    notes = Column(Text, nullable=True, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class AudioStudioSession(Base):
    """Persisted Audio Studio session (track list, mixer state, etc.)."""

    __tablename__ = "audio_studio_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Session")
    data = Column(Text, nullable=False, default="{}")
    is_autosave = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class CompingSession(Base):
    """Persisted multi-take comping session (take lanes + selected regions)."""

    __tablename__ = "comping_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Comp")
    data = Column(JSON, nullable=False, default=dict)
    is_autosave = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class MixerSession(Base):
    """Persisted mixer session (channel strips + master volume)."""

    __tablename__ = "mixer_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Mix")
    data = Column(JSON, nullable=False, default=dict)
    is_autosave = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class SessionAutosaveSnapshot(Base):
    """Versioned autosave snapshot for rolling undo (5-slot window per session).

    Each mutation creates a new snapshot instead of overwriting.  The 5 newest
    snapshots form an undo stack; older ones are pruned on INSERT.  An explicit
    Save (promote) deletes all snapshots for that session.
    """

    __tablename__ = "session_autosave_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False, index=True)
    data = Column(Text, nullable=False, default="{}")
    kind = Column(String, nullable=False, default="studio")  # studio / comp / mixer
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class StandaloneProjectRow(Base):
    """Persisted standalone (Leone-free) project, stored as a JSON document."""

    __tablename__ = "standalone_projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Project")
    project_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class Capture(Base):
    """A single voice input capture (dictation, recording, or uploaded file).

    Stores the original audio alongside the raw transcript and, optionally, a
    refined version produced by the LLM. Refinement flags are serialized as
    JSON so we can reproduce the prompt that generated the refined text.
    """

    __tablename__ = "captures"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    audio_path = Column(String, nullable=False)
    source = Column(String, nullable=False, default="file")  # dictation | recording | file
    language = Column(String, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    transcript_raw = Column(Text, nullable=False, default="")
    transcript_refined = Column(Text, nullable=True)
    stt_model = Column(String, nullable=True)
    llm_model = Column(String, nullable=True)
    refinement_flags = Column(Text, nullable=True)  # JSON blob
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ClipboardItem(Base):
    """Single-slot cross-tab clipboard.

    Holds a serializable reference (by entity id + audio url) to any audio
    output so a clip copied in one tab/window can be pasted into another.
    Only one row exists at a time; copying replaces it (upsert by a fixed
    slot id). Created lazily on first copy.
    """

    __tablename__ = "clipboard"

    SLOT_ID = "current"

    id = Column(String, primary_key=True, default=SLOT_ID)
    kind = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    name = Column(String, nullable=False, default="")
    duration_ms = Column(Integer, nullable=True)
    audio_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ClipboardHistory(Base):
    """Append-only log of every copy, backing the clips library.

    Each PUT to the clipboard slot also inserts a row here; rows past the
    newest HISTORY_LIMIT are pruned. Restoring a row re-PUTs it to the slot.
    """

    __tablename__ = "clipboard_history"
    __table_args__ = (Index("ix_clipboard_history_created_at", "created_at"),)

    HISTORY_LIMIT = 20

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kind = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    name = Column(String, nullable=False, default="")
    duration_ms = Column(Integer, nullable=True)
    audio_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class Conversation(Base):
    """A persisted conversation session for an agent (voice chat or assistant)."""

    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_agent_type", "agent_type"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_type = Column(String, nullable=False, default="assistant")  # "assistant" | "voice_chat"
    title = Column(String, nullable=True)
    model_id = Column(String, nullable=True)
    provider_id = Column(String, nullable=True)
    system_prompt = Column(Text, nullable=True)
    is_favorited = Column(Boolean, default=False)
    message_count = Column(Integer, default=0)
    last_message_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ConversationMessage(Base):
    """A single message in a persisted conversation."""

    __tablename__ = "conversation_messages"
    __table_args__ = (Index("ix_conversation_messages_conversation_id", "conversation_id"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    role = Column(String, nullable=False)  # "user" | "assistant" | "system" | "tool"
    content = Column(Text, nullable=False, default="")
    tool_name = Column(String, nullable=True)
    tool_args = Column(JSON, nullable=True)
    tool_result = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class AgentMemory(Base):
    """Long-term memory facts extracted from conversations."""

    __tablename__ = "agent_memory"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_type = Column(String, nullable=False, default="assistant")  # "assistant" | "voice_chat"
    category = Column(String, nullable=False, default="preference")  # "preference" | "fact" | "instruction" | "context"
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    source_conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True)
    confidence = Column(Float, default=1.0)
    is_stale = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class VoiceChatSettings(Base):
    """Persisted voice chat provider/model settings."""

    __tablename__ = "voice_chat_settings"

    id = Column(Integer, primary_key=True, default=1)
    stt_model = Column(String, nullable=False, default="base")
    tts_engine = Column(String, nullable=False, default="")
    tts_voice = Column(String, nullable=True)
    llm_provider = Column(String, nullable=True)
    llm_model = Column(String, nullable=True)
    llm_api_key = Column(Text, nullable=True)
    llm_base_url = Column(String, nullable=True)
    language = Column(String, nullable=False, default="en")
    system_prompt = Column(Text, nullable=True)
    enable_tools = Column(Boolean, nullable=False, default=True)
    voice_changer_enabled = Column(Boolean, nullable=False, default=False)
    voice_changer_port = Column(Integer, nullable=True, default=17494)
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class License(Base):
    """An installed, signed marketplace license (see docs/MARKETPLACE_PLAN.md §3)."""

    __tablename__ = "licenses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product = Column(String, nullable=False)
    device_id = Column(String, nullable=False, default="*")
    purchaser = Column(String, nullable=True)
    issued_at = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)
    signature = Column(String, nullable=False)
    raw_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class Entitlement(Base):
    """One granted entitlement row, denormalized from a License for fast lookup."""

    __tablename__ = "entitlements"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String, ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    entitlement = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class InstalledPlugin(Base):
    """A marketplace plugin bundle installed into the app.

    Security: plugins are installed ``enabled=False``. The ``verified`` flag means
    the bundle's Ed25519 signature checked out (executable kinds require it); all
    bundles are checksum-gated at install regardless of this flag.
    """

    __tablename__ = "installed_plugins"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    plugin_id = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    version = Column(String, nullable=False, default="0.0.0")
    developer = Column(String, nullable=True)
    kind = Column(String, nullable=True)
    manifest_json = Column(Text, nullable=True)
    signature = Column(String, nullable=True)
    verified = Column(Boolean, nullable=False, default=False)
    enabled = Column(Boolean, nullable=False, default=False)
    trust_external = Column(Boolean, nullable=False, default=False)
    install_path = Column(String, nullable=True)
    installed_at = Column(DateTime, default=lambda: datetime.now(UTC))


class AgentProject(Base):
    """A scoped workspace that bounds the agent's memory, plans, and sources.

    Vendored from galileo-core's ``ProjectRepo`` concept: a project groups
    conversations, memory, plan artifacts, and asset sources so the agent
    operates within a well-defined context rather than global state. Uses a
    dedicated table so it never collides with 21-labs' studio ``Project``.
    """

    __tablename__ = "agent_projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    source_url = Column(String, nullable=True)
    checkout_commit = Column(String, nullable=True)
    local_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AgentProjectSource(Base):
    """An asset source attached to an agent project (file, URL, or acquired library)."""

    __tablename__ = "agent_project_sources"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("agent_projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    source_type = Column(String, nullable=False, default="file")  # file | url | freesound | polyhaven
    local_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ModelDownload(Base):
    """Download manifest: the single source of truth for 'which models has this
    install downloaded'. A model may only be *loaded* if a row exists here; the
    file may still be missing locally (user deleted it), in which case the UI
    offers a re-download rather than a silent auto-fetch.

    Tamper-evident by construction: a DB table (not user-editable JSON), keyed by
    the global catalog (model_name, model_size), so a duplicate download is
    idempotent and the gate can't be flipped from the app UI.
    """

    __tablename__ = "model_downloads"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    model_name = Column(String, nullable=False)
    model_size = Column(String, nullable=True)
    engine = Column(String, nullable=False)
    hf_repo_id = Column(String, nullable=True)
    local_path = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    downloaded_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (Index("ix_model_downloads_name_size", "model_name", "model_size", unique=True),)


class TelemetryEvent(Base):
    """Anonymous telemetry event for usage analytics."""

    __tablename__ = "telemetry_events"
    __table_args__ = (
        Index("ix_telemetry_events_type", "event_type"),
        Index("ix_telemetry_events_timestamp", "timestamp"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String, nullable=False)
    properties = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)


class AppSetting(Base):
    """Generic app preference persisted in SQLite as a (key, json) row.

    Backs user-toggled engine preferences the app must remember across restarts
    — currently the per-engine 'always-on' keepalive flag. Living in SQL (not
    user-editable JSON) keeps it next to the download manifest that the
    no-auto-download gate is built on.
    """

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value_json = Column(JSON, nullable=True)


class Audiobook(Base):
    """Audiobook project — separate from Stories; owns chapters + cast + cover."""

    __tablename__ = "audiobooks"
    __table_args__ = (Index("ix_audiobooks_updated_at", "updated_at"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    cover_path = Column(String, nullable=True)
    source_path = Column(String, nullable=True)
    source_type = Column(String, nullable=True)  # epub | pdf | script | empty
    total_duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AudiobookChapter(Base):
    """Ordered chapter belonging to an audiobook."""

    __tablename__ = "audiobook_chapters"
    __table_args__ = (
        Index("ix_audiobook_chapters_book_id", "audiobook_id"),
        Index("ix_audiobook_chapters_order", "audiobook_id", "order_index"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    audiobook_id = Column(String, ForeignKey("audiobooks.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False, default="Chapter")
    text = Column(Text, nullable=False, default="")
    word_count = Column(Integer, nullable=True)
    # Rendering state
    status = Column(String, nullable=False, default="draft")  # draft | queued | rendering | done | failed
    generation_id = Column(String, ForeignKey("generations.id"), nullable=True)
    audio_path = Column(String, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AudiobookVoiceCast(Base):
    """Per-character voice assignment for an audiobook."""

    __tablename__ = "audiobook_voice_cast"
    __table_args__ = (
        Index("ix_audiobook_cast_book", "audiobook_id"),
        Index("ix_audiobook_cast_book_char", "audiobook_id", "character", unique=True),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    audiobook_id = Column(String, ForeignKey("audiobooks.id", ondelete="CASCADE"), nullable=False)
    character = Column(String, nullable=False)
    profile_id = Column(String, ForeignKey("profiles.id"), nullable=True)
    engine = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AudiobookUtterance(Base):
    """Per-utterance split of a chapter by ^Name: script lines."""

    __tablename__ = "audiobook_utterances"
    __table_args__ = (
        Index("ix_utterances_chapter", "chapter_id"),
        Index("ix_utterances_book", "audiobook_id"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chapter_id = Column(String, ForeignKey("audiobook_chapters.id", ondelete="CASCADE"), nullable=False)
    audiobook_id = Column(String, ForeignKey("audiobooks.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    character = Column(String, nullable=False, default="Narrator")
    text = Column(Text, nullable=False, default="")
    profile_id = Column(String, ForeignKey("profiles.id"), nullable=True)
    engine = Column(String, nullable=True)
    generation_id = Column(String, ForeignKey("generations.id"), nullable=True)
    audio_path = Column(String, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="draft")
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class LibraryTag(Base):
    """User-defined tag for the unified Audio Library."""

    __tablename__ = "library_tags"
    __table_args__ = (Index("ix_library_tags_name", "name", unique=True),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    color = Column(String, nullable=True)  # hex e.g. #b39a3d
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class LibraryItemTag(Base):
    """Many-to-many mapping between a library item (polymorphic) and a tag."""

    __tablename__ = "library_item_tags"
    __table_args__ = (
        Index("ix_library_item_tags_item", "item_id", "item_kind"),
        Index("ix_library_item_tags_tag", "tag_id"),
    )

    item_id = Column(String, primary_key=True)
    item_kind = Column(String, primary_key=True)  # generation|capture|profile_sample|audiobook_utterance|dsp
    tag_id = Column(String, ForeignKey("library_tags.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class CustomSkill(Base):
    """User-created agent skill — a reusable workflow playbook."""

    __tablename__ = "custom_skills"
    __table_args__ = (Index("ix_custom_skills_skill_id", "skill_id", unique=True),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    skill_id = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    triggers = Column(JSON, nullable=False, default=list)  # list[str]
    steps = Column(JSON, nullable=False, default=list)  # list[str]
    tools = Column(JSON, nullable=False, default=dict)  # dict[str, list[str]]
    pitfalls = Column(JSON, nullable=False, default=list)  # list[str]
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class SongDraft(Base):
    """A songwriter-studio draft (song DNA + lyrics), ported from Resonant.

    The draft body mirrors Resonant's SongwritingDraft (language, title,
    idea, hook, pointOfView, tense, mood, genre, audience, imagery,
    stylePrompt, lyrics) so briefs and analyses stay compatible.
    """

    __tablename__ = "song_drafts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False, default="")
    language = Column(String, nullable=False, default="en")
    draft_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
