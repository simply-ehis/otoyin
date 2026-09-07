"""Audiobook project, chapter, cast, and utterance models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text

from .base import Base


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
