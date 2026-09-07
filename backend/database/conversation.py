"""Conversation, agent memory, and voice chat models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from .base import Base


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
