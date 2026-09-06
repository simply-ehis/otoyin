"""
Advanced story item operations: merge, speed, match-loudness, crossfade,
and move-to-story.

Merge renders a new generation (reusing the first item's voice profile);
speed is non-destructive metadata applied at mix time; match-loudness pins
per-item gain so every clip hits one RMS target; crossfade overlaps two
neighbors with complementary fades; move-to-story relocates or copies an
item into another story.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import numpy as np
from sqlalchemy.orm import Session

from ... import config
from ...database import Generation as DBGeneration, Story as DBStory, StoryItem as DBStoryItem
from ...models import (
    StoryItemCrossfade,
    StoryItemDetail,
    StoryItemMerge,
    StoryItemMoveToStory,
    StoryItemSpeed,
    StoryMatchLoudness,
)
from ...utils.audio import save_audio
from .helpers import _build_item_detail, _load_clip_audio, _resolve_profile_name
from .history import push_undo


def _touch(db: Session, story_id: str) -> None:
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)


def _effective_ms(item: DBStoryItem, generation: DBGeneration) -> int:
    original_ms = int((generation.duration or 0) * 1000)
    base = original_ms - (item.trim_start_ms or 0) - (item.trim_end_ms or 0)
    speed = float(item.speed or 1.0)
    return max(0, int(base / speed)) if speed > 0 else max(0, base)


async def merge_story_items(
    story_id: str,
    data: StoryItemMerge,
    db: Session,
) -> StoryItemDetail | None:
    """Render two items into one (first keeps position; second is removed)."""
    first = db.query(DBStoryItem).filter_by(id=data.first_item_id, story_id=story_id).first()
    second = db.query(DBStoryItem).filter_by(id=data.second_item_id, story_id=story_id).first()
    if not first or not second or first.id == second.id:
        return None
    gen_a = db.query(DBGeneration).filter_by(id=first.generation_id).first()
    gen_b = db.query(DBGeneration).filter_by(id=second.generation_id).first()
    if not gen_a or not gen_b:
        return None

    sample_rate = 24000
    audio_a, _ = _load_clip_audio(first, gen_a, db, sample_rate)
    audio_b, _ = _load_clip_audio(second, gen_b, db, sample_rate)
    if audio_a is None or audio_b is None:
        return None

    def _mono(x: np.ndarray) -> np.ndarray:
        return x.mean(axis=1).astype(np.float32) if x.ndim == 2 else x.astype(np.float32)

    merged = np.concatenate([_mono(audio_a), _mono(audio_b)])
    new_path = config.get_generations_dir() / f"merged_{uuid.uuid4().hex[:8]}.wav"
    save_audio(merged, str(new_path), sample_rate)

    push_undo(db, story_id)
    generation = DBGeneration(
        id=str(uuid.uuid4()),
        profile_id=gen_a.profile_id,
        text=f"{gen_a.text} {gen_b.text}".strip(),
        language=gen_a.language,
        audio_path=config.to_storage_path(new_path),
        duration=len(merged) / sample_rate,
        engine=gen_a.engine,
        status="completed",
        source="story_merge",
    )
    db.add(generation)
    db.flush()

    first.generation_id = generation.id
    first.version_id = None
    first.trim_start_ms = 0
    first.trim_end_ms = 0
    # Keep the outer fades (lead-in of first, tail of second), drop the seam.
    first.fade_out_ms = second.fade_out_ms or 0
    db.delete(second)
    _touch(db, story_id)
    db.commit()
    db.refresh(first)
    return _build_item_detail(first, generation, _resolve_profile_name(db, generation), db)


async def set_story_item_speed(
    story_id: str,
    item_id: str,
    data: StoryItemSpeed,
    db: Session,
) -> StoryItemDetail | None:
    """Set non-destructive playback speed (0.25-4.0, constant pitch at mix)."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None
    push_undo(db, story_id)
    item.speed = float(data.speed)
    _touch(db, story_id)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def match_story_loudness(
    story_id: str,
    data: StoryMatchLoudness,
    db: Session,
) -> list[StoryItemDetail] | None:
    """Pin every item's gain so all clips hit one RMS target (non-destructive)."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return None
    items = db.query(DBStoryItem).filter_by(story_id=story_id).all()
    if not items:
        return None
    push_undo(db, story_id)
    target_rms = 10.0 ** (data.target_lufs / 20.0)
    out: list[StoryItemDetail] = []
    for item in items:
        generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
        if not generation:
            continue
        audio, _ = _load_clip_audio(item, generation, db, 24000)
        if audio is None:
            out.append(_build_item_detail(item, generation, _resolve_profile_name(db, generation), db))
            continue
        mono = audio.mean(axis=1) if audio.ndim == 2 else audio
        rms = float(np.sqrt(np.mean(mono.astype(np.float64) ** 2)))
        if rms > 0:
            # Existing gain/volume already shape `audio` via _load_clip_audio,
            # so set absolute gain rather than stacking on top.
            total_gain = target_rms / rms
            current_linear = (float(item.volume or 1.0)) * (10.0 ** (float(item.gain_db or 0.0) / 20.0))
            if current_linear > 0:
                item.gain_db = max(
                    -24.0, min(24.0, 20.0 * np.log10(total_gain / current_linear) + float(item.gain_db or 0.0))
                )
        out.append(_build_item_detail(item, generation, _resolve_profile_name(db, generation), db))
    _touch(db, story_id)
    db.commit()
    return out


async def crossfade_story_items(
    story_id: str,
    item_id: str,
    data: StoryItemCrossfade,
    db: Session,
) -> list[StoryItemDetail] | None:
    """Overlap the next item by ``duration_ms`` with complementary fades."""
    first = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    second = db.query(DBStoryItem).filter_by(id=data.next_item_id, story_id=story_id).first()
    if not first or not second or first.id == second.id:
        return None
    gen_a = db.query(DBGeneration).filter_by(id=first.generation_id).first()
    gen_b = db.query(DBGeneration).filter_by(id=second.generation_id).first()
    if not gen_a or not gen_b:
        return None
    dur = int(data.duration_ms)
    if dur > _effective_ms(first, gen_a) or dur > _effective_ms(second, gen_b):
        return None
    push_undo(db, story_id)
    first.fade_out_ms = dur
    second.fade_in_ms = dur
    second.start_time_ms = max(0, first.start_time_ms + _effective_ms(first, gen_a) - dur)
    _touch(db, story_id)
    db.commit()
    db.refresh(first)
    db.refresh(second)
    return [
        _build_item_detail(first, gen_a, _resolve_profile_name(db, gen_a), db),
        _build_item_detail(second, gen_b, _resolve_profile_name(db, gen_b), db),
    ]


async def move_item_to_story(
    story_id: str,
    item_id: str,
    data: StoryItemMoveToStory,
    db: Session,
) -> StoryItemDetail | None:
    """Move (or copy) an item into another story, appended at the end."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    target = db.query(DBStory).filter_by(id=data.target_story_id).first()
    if not item or not target or target.id == story_id:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation:
        return None
    siblings = db.query(DBStoryItem).filter_by(story_id=target.id).all()
    end_ms = 0
    for sib in siblings:
        sib_gen = db.query(DBGeneration).filter_by(id=sib.generation_id).first()
        if sib_gen:
            end_ms = max(end_ms, sib.start_time_ms + _effective_ms(sib, sib_gen) + 200)
    # Capture everything before deleting (move) so no attribute is read off a
    # deleted row.
    attrs = {
        "old_id": item.id,
        "generation_id": item.generation_id,
        "version_id": item.version_id,
        "track": item.track,
        "trim_start_ms": item.trim_start_ms,
        "trim_end_ms": item.trim_end_ms,
        "volume": item.volume,
        "fade_in_ms": item.fade_in_ms,
        "fade_out_ms": item.fade_out_ms,
        "gain_db": item.gain_db,
        "pan": item.pan,
        "speed": item.speed,
    }
    push_undo(db, story_id)
    push_undo(db, target.id)
    old_id = attrs.pop("old_id")
    if not data.as_copy:
        db.delete(item)
        db.flush()
    new_item = DBStoryItem(
        id=old_id if not data.as_copy else str(uuid.uuid4()),
        story_id=target.id,
        start_time_ms=end_ms,
        created_at=datetime.now(UTC),
        **attrs,
    )
    db.add(new_item)
    _touch(db, story_id)
    _touch(db, target.id)
    db.commit()
    db.refresh(new_item)
    return _build_item_detail(new_item, generation, _resolve_profile_name(db, generation), db)
