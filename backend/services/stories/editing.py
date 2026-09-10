"""
Story item editing operations.

Non-destructive edits to story items: trimming, volume, splitting, duplication,
timecode updates, reordering, version pinning, and fades/gain metadata.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from ...database import (
    Generation as DBGeneration,
    Story as DBStory,
    StoryItem as DBStoryItem,
    VoiceProfile as DBVoiceProfile,
)
from ...models import (
    StoryItemBatchUpdate,
    StoryItemDetail,
    StoryItemFade,
    StoryItemGain,
    StoryItemPanUpdate,
    StoryItemSplit,
    StoryItemTrim,
    StoryItemVersionUpdate,
    StoryItemVolumeUpdate,
)
from .helpers import _build_item_detail, _resolve_profile_name
from .history import push_undo


async def trim_story_item(
    story_id: str,
    item_id: str,
    data: StoryItemTrim,
    db: Session,
) -> StoryItemDetail | None:
    """Trim a story item (update trim_start_ms and trim_end_ms)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None

    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None

    max_duration_ms = int(generation.duration * 1000)
    if data.trim_start_ms + data.trim_end_ms >= max_duration_ms:
        return None

    push_undo(db, story_id)
    item.trim_start_ms = data.trim_start_ms
    item.trim_end_ms = data.trim_end_ms

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(item)

    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def update_story_item_volume(
    story_id: str,
    item_id: str,
    data: StoryItemVolumeUpdate,
    db: Session,
) -> StoryItemDetail | None:
    """Update a story item's playback volume (per-clip linear gain)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None

    push_undo(db, story_id)
    item.volume = data.volume

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(item)

    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def split_story_item(
    story_id: str,
    item_id: str,
    data: StoryItemSplit,
    db: Session,
) -> list[StoryItemDetail] | None:
    """Split a story item at a given time, creating two clips."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).with_for_update().first()
    if not item:
        return None

    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None

    current_trim_start = getattr(item, "trim_start_ms", 0)
    current_trim_end = getattr(item, "trim_end_ms", 0)
    original_duration_ms = int(generation.duration * 1000)
    effective_duration_ms = original_duration_ms - current_trim_start - current_trim_end

    if data.split_time_ms <= 0 or data.split_time_ms >= effective_duration_ms:
        return None

    absolute_split_ms = current_trim_start + data.split_time_ms

    push_undo(db, story_id)
    item.trim_end_ms = original_duration_ms - absolute_split_ms
    # Cap the original clip's fade-out so it cannot exceed the new (shorter) effective duration.
    new_effective_ms = data.split_time_ms
    if getattr(item, "fade_out_ms", 0) > new_effective_ms:
        item.fade_out_ms = new_effective_ms

    new_item = DBStoryItem(
        id=str(uuid.uuid4()),
        story_id=story_id,
        generation_id=item.generation_id,
        version_id=getattr(item, "version_id", None),
        start_time_ms=item.start_time_ms + data.split_time_ms,
        track=item.track,
        trim_start_ms=absolute_split_ms,
        trim_end_ms=current_trim_end,
        volume=getattr(item, "volume", 1.0),
        fade_in_ms=getattr(item, "fade_in_ms", 0),
        fade_out_ms=getattr(item, "fade_out_ms", 0),
        created_at=datetime.now(UTC),
    )

    db.add(new_item)

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(item)
    db.refresh(new_item)

    profile_name = _resolve_profile_name(db, generation)

    return [
        _build_item_detail(item, generation, profile_name, db),
        _build_item_detail(new_item, generation, profile_name, db),
    ]


async def duplicate_story_item(
    story_id: str,
    item_id: str,
    db: Session,
) -> StoryItemDetail | None:
    """Duplicate a story item, creating a copy with all properties."""
    original_item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not original_item:
        return None

    generation = db.query(DBGeneration).filter_by(id=original_item.generation_id).first()
    if not generation:
        return None

    current_trim_start = getattr(original_item, "trim_start_ms", 0)
    current_trim_end = getattr(original_item, "trim_end_ms", 0)
    original_duration_ms = int(generation.duration * 1000)
    effective_duration_ms = original_duration_ms - current_trim_start - current_trim_end

    push_undo(db, story_id)
    new_item = DBStoryItem(
        id=str(uuid.uuid4()),
        story_id=story_id,
        generation_id=original_item.generation_id,
        version_id=getattr(original_item, "version_id", None),
        start_time_ms=original_item.start_time_ms + effective_duration_ms + 200,
        track=original_item.track,
        trim_start_ms=current_trim_start,
        trim_end_ms=current_trim_end,
        volume=getattr(original_item, "volume", 1.0),
        created_at=datetime.now(UTC),
    )

    db.add(new_item)

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(new_item)

    return _build_item_detail(new_item, generation, _resolve_profile_name(db, generation), db)


async def update_story_item_times(
    story_id: str,
    data: StoryItemBatchUpdate,
    db: Session,
) -> bool:
    """Update story item timecodes."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return False

    items = db.query(DBStoryItem).filter_by(story_id=story_id).all()
    item_map = {item.generation_id: item for item in items}

    for update in data.updates:
        if update.generation_id not in item_map:
            return False

    push_undo(db, story_id)
    for update in data.updates:
        item_map[update.generation_id].start_time_ms = update.start_time_ms

    story.updated_at = datetime.now(UTC)
    db.commit()
    return True


async def reorder_story_items(
    story_id: str,
    generation_ids: list[str],
    db: Session,
    gap_ms: int = 200,
) -> list[StoryItemDetail] | None:
    """Reorder story items and recalculate timecodes."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return None

    items_with_gen = (
        db.query(DBStoryItem, DBGeneration, DBVoiceProfile.name.label("profile_name"))
        .join(DBGeneration, DBStoryItem.generation_id == DBGeneration.id)
        .outerjoin(DBVoiceProfile, DBGeneration.profile_id == DBVoiceProfile.id)
        .filter(DBStoryItem.story_id == story_id)
        .all()
    )

    item_map = {item.generation_id: (item, gen, profile_name) for item, gen, profile_name in items_with_gen}

    if set(generation_ids) != set(item_map.keys()):
        return None

    push_undo(db, story_id)
    current_time_ms = 0
    updated_items = []

    for gen_id in generation_ids:
        item, generation, profile_name = item_map[gen_id]

        original_duration_ms = int(generation.duration * 1000)
        trim_start_ms = getattr(item, "trim_start_ms", 0)
        trim_end_ms = getattr(item, "trim_end_ms", 0)
        effective_duration_ms = original_duration_ms - trim_start_ms - trim_end_ms
        speed = float(getattr(item, "speed", 1.0) or 1.0)
        if speed != 1.0:
            effective_duration_ms = int(effective_duration_ms / speed)

        item.start_time_ms = current_time_ms
        current_time_ms += max(0, effective_duration_ms) + gap_ms

        updated_items.append(_build_item_detail(item, generation, profile_name, db))

    story.updated_at = datetime.now(UTC)
    db.commit()
    return updated_items


async def set_story_item_version(
    story_id: str,
    item_id: str,
    data: StoryItemVersionUpdate,
    db: Session,
) -> StoryItemDetail | None:
    """Pin a story item to a specific generation version."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None

    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None

    if data.version_id:
        from ...database import GenerationVersion as DBGenerationVersion

        version = db.query(DBGenerationVersion).filter_by(id=data.version_id, generation_id=item.generation_id).first()
        if not version:
            return None

    push_undo(db, story_id)
    item.version_id = data.version_id

    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(item)

    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def set_story_item_fade(
    story_id: str,
    item_id: str,
    data: StoryItemFade,
    db: Session,
) -> StoryItemDetail | None:
    """Set fade-in and fade-out durations (non-destructive metadata)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None
    push_undo(db, story_id)
    item.fade_in_ms = data.fade_in_ms
    item.fade_out_ms = data.fade_out_ms
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def set_story_item_gain(
    story_id: str,
    item_id: str,
    data: StoryItemGain,
    db: Session,
) -> StoryItemDetail | None:
    """Set gain in dB (non-destructive metadata)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None
    push_undo(db, story_id)
    item.gain_db = data.gain_db
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def set_story_item_pan(
    story_id: str,
    item_id: str,
    data: StoryItemPanUpdate,
    db: Session,
) -> StoryItemDetail | None:
    """Set stereo pan position (non-destructive metadata, -1.0 … 1.0)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None
    push_undo(db, story_id)
    item.pan = max(-1.0, min(1.0, float(data.pan)))
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)
