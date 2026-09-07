"""Voice profile and sample models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from .base import Base


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
