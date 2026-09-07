"""Generation and generation-related models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from .base import Base


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
