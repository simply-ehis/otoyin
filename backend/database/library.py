"""Audio library tag models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String

from .base import Base


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
