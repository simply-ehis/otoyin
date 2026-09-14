"""Story and story-item models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from .base import Base


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
    story_id = Column(String, ForeignKey("stories.id", ondelete="CASCADE"), nullable=False)
    generation_id = Column(String, ForeignKey("generations.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String, ForeignKey("generation_versions.id", ondelete="SET NULL"), nullable=True)
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
    story_id = Column(String, ForeignKey("stories.id", ondelete="CASCADE"), nullable=False)
    stack = Column(String, nullable=False, default="undo")  # "undo" | "redo"
    items_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
