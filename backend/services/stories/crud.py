"""
Story and story-item CRUD operations.

Covers story lifecycle (create/list/get/update/delete) and the basic
add / move / remove operations on story items.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...database import (
    Generation as DBGeneration,
    Story as DBStory,
    StoryItem as DBStoryItem,
    VoiceProfile as DBVoiceProfile,
)
from ...models import (
    StoryCreate,
    StoryDetailResponse,
    StoryItemCreate,
    StoryItemDetail,
    StoryItemMove,
    StoryResponse,
)
from .helpers import _build_item_detail, _resolve_profile_name
from .history import push_undo


async def create_story(
    data: StoryCreate,
    db: Session,
) -> StoryResponse:
    """Create a new story."""
    db_story = DBStory(
        id=str(uuid.uuid4()),
        name=data.name,
        description=data.description,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    db.add(db_story)
    db.commit()
    db.refresh(db_story)

    item_count = db.query(func.count(DBStoryItem.id)).filter(DBStoryItem.story_id == db_story.id).scalar()

    response = StoryResponse.model_validate(db_story)
    response.item_count = item_count
    return response


async def list_stories(
    db: Session,
) -> list[StoryResponse]:
    """List all stories."""
    stories = db.query(DBStory).order_by(DBStory.updated_at.desc()).all()

    result = []
    for story in stories:
        item_count = db.query(func.count(DBStoryItem.id)).filter(DBStoryItem.story_id == story.id).scalar()

        response = StoryResponse.model_validate(story)
        response.item_count = item_count
        result.append(response)

    return result


async def get_story(
    story_id: str,
    db: Session,
) -> StoryDetailResponse | None:
    """Get a story with all its items."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return None

    items = (
        db.query(DBStoryItem, DBGeneration, DBVoiceProfile.name.label("profile_name"))
        .join(DBGeneration, DBStoryItem.generation_id == DBGeneration.id)
        .outerjoin(DBVoiceProfile, DBGeneration.profile_id == DBVoiceProfile.id)
        .filter(DBStoryItem.story_id == story_id)
        .order_by(DBStoryItem.start_time_ms)
        .all()
    )

    item_details = []
    for item, generation, profile_name in items:
        item_details.append(_build_item_detail(item, generation, profile_name, db))

    response = StoryDetailResponse.model_validate(story)
    response.items = item_details
    return response


async def update_story(
    story_id: str,
    data: StoryCreate,
    db: Session,
) -> StoryResponse | None:
    """Update a story."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return None

    story.name = data.name
    story.description = data.description
    story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(story)

    item_count = db.query(func.count(DBStoryItem.id)).filter(DBStoryItem.story_id == story.id).scalar()

    response = StoryResponse.model_validate(story)
    response.item_count = item_count
    return response


async def delete_story(
    story_id: str,
    db: Session,
) -> bool:
    """Delete a story and all its items."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return False

    db.query(DBStoryItem).filter_by(story_id=story_id).delete()
    db.delete(story)
    db.commit()

    return True


async def add_item_to_story(
    story_id: str,
    data: StoryItemCreate,
    db: Session,
) -> StoryItemDetail | None:
    """Add a generation to a story."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return None

    generation = db.query(DBGeneration).filter_by(id=data.generation_id).first()
    if not generation:
        return None

    existing = db.query(DBStoryItem).filter_by(story_id=story_id, generation_id=data.generation_id).first()
    if existing:
        return _build_item_detail(existing, generation, _resolve_profile_name(db, generation), db)

    push_undo(db, story_id)
    track = data.track if data.track is not None else 0

    if data.start_time_ms is not None:
        start_time_ms = data.start_time_ms
    else:
        existing_items = (
            db.query(DBStoryItem, DBGeneration)
            .join(DBGeneration, DBStoryItem.generation_id == DBGeneration.id)
            .filter(
                DBStoryItem.story_id == story_id,
                DBStoryItem.track == track,
            )
            .all()
        )

        if not existing_items:
            start_time_ms = 0
        else:
            max_end_time_ms = 0
            for item, gen in existing_items:
                item_end_ms = item.start_time_ms + int(gen.duration * 1000)
                max_end_time_ms = max(max_end_time_ms, item_end_ms)

            start_time_ms = max_end_time_ms + 200

    item = DBStoryItem(
        id=str(uuid.uuid4()),
        story_id=story_id,
        generation_id=data.generation_id,
        start_time_ms=start_time_ms,
        track=track,
        pan=float(getattr(data, "pan", 0.0) or 0.0),
        created_at=datetime.now(UTC),
    )

    db.add(item)
    story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)

    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def move_story_item(
    story_id: str,
    item_id: str,
    data: StoryItemMove,
    db: Session,
) -> StoryItemDetail | None:
    """Move a story item (update position and/or track)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None

    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None

    push_undo(db, story_id)
    item.start_time_ms = data.start_time_ms
    item.track = data.track

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(item)

    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def remove_item_from_story(
    story_id: str,
    item_id: str,
    db: Session,
) -> bool:
    """Remove a story item from a story."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return False

    push_undo(db, story_id)
    db.delete(item)

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    return True
