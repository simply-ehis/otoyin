"""
Undo/redo snapshots for story item lists.

Before each item mutation the service calls :func:`push_undo`; undo pops the
newest undo snapshot (stashing the present state on the redo stack) and redo
does the reverse. Snapshots are plain JSON rows so no audio bytes are
duplicated — versions and generations are untouched, only the item list is
rewound. Both stacks prune to the newest ``HISTORY_LIMIT`` entries.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from ...database import Story as DBStory, StoryEditSnapshot as DBSnapshot, StoryItem as DBStoryItem

SNAPSHOT_FIELDS = (
    "id",
    "story_id",
    "generation_id",
    "version_id",
    "start_time_ms",
    "track",
    "trim_start_ms",
    "trim_end_ms",
    "volume",
    "fade_in_ms",
    "fade_out_ms",
    "gain_db",
    "pan",
    "speed",
)


def _snapshot_items(db: Session, story_id: str) -> list[dict]:
    rows = db.query(DBStoryItem).filter_by(story_id=story_id).order_by(DBStoryItem.start_time_ms).all()
    snap = []
    for row in rows:
        snap.append(
            {
                field: getattr(
                    row, field, 0 if field not in ("id", "story_id", "generation_id", "version_id") else None
                )
                for field in SNAPSHOT_FIELDS
            }
        )
    return snap


def _restore_items(db: Session, story_id: str, snap: list[dict]) -> None:
    db.query(DBStoryItem).filter_by(story_id=story_id).delete(synchronize_session=False)
    for entry in snap:
        row = DBStoryItem(
            id=entry.get("id") or str(uuid.uuid4()),
            story_id=story_id,
            generation_id=entry["generation_id"],
            version_id=entry.get("version_id"),
            start_time_ms=int(entry.get("start_time_ms", 0)),
            track=int(entry.get("track", 0)),
            trim_start_ms=int(entry.get("trim_start_ms", 0)),
            trim_end_ms=int(entry.get("trim_end_ms", 0)),
            volume=float(entry.get("volume", 1.0)),
            fade_in_ms=int(entry.get("fade_in_ms", 0)),
            fade_out_ms=int(entry.get("fade_out_ms", 0)),
            gain_db=float(entry.get("gain_db", 0.0)),
            pan=float(entry.get("pan", 0.0)),
            speed=float(entry.get("speed", 1.0) or 1.0),
        )
        db.add(row)


def _prune(db: Session, story_id: str, stack: str) -> None:
    stale_ids = [
        row_id
        for (row_id,) in db.query(DBSnapshot.id)
        .filter_by(story_id=story_id, stack=stack)
        .order_by(DBSnapshot.created_at.desc())
        .offset(DBSnapshot.HISTORY_LIMIT)
        .all()
    ]
    if stale_ids:
        db.query(DBSnapshot).filter(DBSnapshot.id.in_(stale_ids)).delete(synchronize_session=False)


def push_undo(db: Session, story_id: str) -> None:
    """Record the pre-mutation state; clears the redo stack (new branch)."""
    if db.query(DBStory).filter_by(id=story_id).first() is None:
        return
    db.add(
        DBSnapshot(
            id=str(uuid.uuid4()),
            story_id=story_id,
            stack="undo",
            items_json=json.dumps(_snapshot_items(db, story_id)),
            created_at=datetime.now(UTC),
        )
    )
    db.query(DBSnapshot).filter_by(story_id=story_id, stack="redo").delete(synchronize_session=False)
    _prune(db, story_id, "undo")
    db.commit()


def _pop(db: Session, story_id: str, stack: str) -> list[dict] | None:
    row = db.query(DBSnapshot).filter_by(story_id=story_id, stack=stack).order_by(DBSnapshot.created_at.desc()).first()
    if row is None:
        return None
    snap = json.loads(row.items_json or "[]")
    db.delete(row)
    db.commit()
    return snap


def undo(db: Session, story_id: str) -> bool:
    """Rewind one step. Returns False when the undo stack is empty."""
    if db.query(DBStory).filter_by(id=story_id).first() is None:
        return False
    snap = _pop(db, story_id, "undo")
    if snap is None:
        return False
    db.add(
        DBSnapshot(
            id=str(uuid.uuid4()),
            story_id=story_id,
            stack="redo",
            items_json=json.dumps(_snapshot_items(db, story_id)),
            created_at=datetime.now(UTC),
        )
    )
    _restore_items(db, story_id, snap)
    _prune(db, story_id, "redo")
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    return True


def redo(db: Session, story_id: str) -> bool:
    """Re-apply one undone step. Returns False when the redo stack is empty."""
    if db.query(DBStory).filter_by(id=story_id).first() is None:
        return False
    snap = _pop(db, story_id, "redo")
    if snap is None:
        return False
    db.add(
        DBSnapshot(
            id=str(uuid.uuid4()),
            story_id=story_id,
            stack="undo",
            items_json=json.dumps(_snapshot_items(db, story_id)),
            created_at=datetime.now(UTC),
        )
    )
    _restore_items(db, story_id, snap)
    _prune(db, story_id, "undo")
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    return True


def history_depth(db: Session, story_id: str) -> dict[str, int]:
    """Undo/redo stack sizes (drives button disabled states)."""
    undo_count = db.query(DBSnapshot).filter_by(story_id=story_id, stack="undo").count()
    redo_count = db.query(DBSnapshot).filter_by(story_id=story_id, stack="redo").count()
    return {"undo": undo_count, "redo": redo_count}
