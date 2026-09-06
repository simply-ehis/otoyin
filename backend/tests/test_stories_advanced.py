"""Tests for advanced story editing: merge, speed, match-loudness,
crossfade, move-to-story, and undo/redo snapshots."""

from __future__ import annotations

import tempfile
import wave
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import backend.config as cfg
from backend.database.models import (
    Base,
    Generation as DBGeneration,
    Story as DBStory,
    StoryItem as DBStoryItem,
    VoiceProfile as DBVoiceProfile,
)
from backend.models import (
    StoryItemCrossfade,
    StoryItemMerge,
    StoryItemMoveToStory,
    StoryItemSpeed,
    StoryMatchLoudness,
)
from backend.services import stories


def _wav(path: Path, seconds: float = 0.5) -> Path:
    import numpy as np

    rate = 16000
    n = int(rate * seconds)
    t = np.arange(n) / rate
    audio = (0.4 * np.sin(2 * np.pi * 440 * t) * 32767).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(audio.tobytes())
    return path


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg, "_data_dir", tmp_path / "data")
    return tmp_path / "data"


@pytest.fixture
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    import os

    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    engine.dispose()
    Path(path).unlink(missing_ok=True)


def _seed(db: Session, data_dir: Path) -> str:
    gens = data_dir / "generations"
    db.add(DBVoiceProfile(id="prof-1", name="Ada", language="en", voice_type="cloned"))
    for gid in ("gen-a", "gen-b"):
        _wav(gens / f"{gid}.wav", seconds=0.5)
        db.add(
            DBGeneration(
                id=gid,
                profile_id="prof-1",
                text=f"text {gid}",
                language="en",
                audio_path=str(gens / f"{gid}.wav"),
                duration=0.5,
                engine="kokoro",
            )
        )
    db.add(DBStory(id="story-1", name="S1", description="d"))
    db.add(DBStoryItem(id="item-a", story_id="story-1", generation_id="gen-a", start_time_ms=0, track=0))
    db.add(DBStoryItem(id="item-b", story_id="story-1", generation_id="gen-b", start_time_ms=700, track=0))
    db.commit()
    return "story-1"


def _items(db: Session, story_id: str = "story-1") -> list[DBStoryItem]:
    return db.query(DBStoryItem).filter_by(story_id=story_id).order_by(DBStoryItem.start_time_ms).all()


async def test_merge_two_items(db, data_dir):
    _seed(db, data_dir)
    out = await stories.merge_story_items(
        "story-1", StoryItemMerge(first_item_id="item-a", second_item_id="item-b"), db
    )
    assert out is not None
    assert out.generation_id not in ("gen-a", "gen-b")
    assert out.duration == pytest.approx(1.0, abs=0.05)
    remaining = _items(db)
    assert [i.id for i in remaining] == ["item-a"]
    assert remaining[0].trim_start_ms == 0 and remaining[0].trim_end_ms == 0


async def test_merge_same_item_rejected(db, data_dir):
    _seed(db, data_dir)
    out = await stories.merge_story_items(
        "story-1", StoryItemMerge(first_item_id="item-a", second_item_id="item-a"), db
    )
    assert out is None


async def test_set_speed_persists(db, data_dir):
    _seed(db, data_dir)
    out = await stories.set_story_item_speed("story-1", "item-a", StoryItemSpeed(speed=2.0), db)
    assert out is not None
    assert out.speed == 2.0
    assert db.query(DBStoryItem).filter_by(id="item-a").first().speed == 2.0


async def test_set_speed_out_of_range_rejected_by_model():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        StoryItemSpeed(speed=9.0)


async def test_match_loudness_sets_gain(db, data_dir):
    _seed(db, data_dir)
    out = await stories.match_story_loudness("story-1", StoryMatchLoudness(target_lufs=-16.0), db)
    assert out is not None and len(out) == 2
    gains = [db.query(DBStoryItem).filter_by(id=i).first().gain_db for i in ("item-a", "item-b")]
    assert all(g != 0.0 for g in gains)


async def test_crossfade_overlaps_and_fades(db, data_dir):
    _seed(db, data_dir)
    out = await stories.crossfade_story_items(
        "story-1", "item-a", StoryItemCrossfade(next_item_id="item-b", duration_ms=200), db
    )
    assert out is not None and len(out) == 2
    first, second = (
        db.query(DBStoryItem).filter_by(id="item-a").first(),
        db.query(DBStoryItem).filter_by(id="item-b").first(),
    )
    assert first.fade_out_ms == 200
    assert second.fade_in_ms == 200
    assert second.start_time_ms == first.start_time_ms + 500 - 200


async def test_crossfade_longer_than_clip_rejected(db, data_dir):
    _seed(db, data_dir)
    out = await stories.crossfade_story_items(
        "story-1", "item-a", StoryItemCrossfade(next_item_id="item-b", duration_ms=900), db
    )
    assert out is None


async def test_move_item_to_another_story(db, data_dir):
    _seed(db, data_dir)
    db.add(DBStory(id="story-2", name="S2", description="d"))
    db.commit()
    out = await stories.move_item_to_story("story-1", "item-a", StoryItemMoveToStory(target_story_id="story-2"), db)
    assert out is not None
    assert out.story_id == "story-2"
    assert db.query(DBStoryItem).filter_by(id="item-a", story_id="story-1").first() is None
    assert db.query(DBStoryItem).filter_by(id="item-a", story_id="story-2").first() is not None


async def test_copy_item_to_another_story_keeps_source(db, data_dir):
    _seed(db, data_dir)
    db.add(DBStory(id="story-2", name="S2", description="d"))
    db.commit()
    out = await stories.move_item_to_story(
        "story-1", "item-a", StoryItemMoveToStory(target_story_id="story-2", as_copy=True), db
    )
    assert out is not None and out.id != "item-a"
    assert db.query(DBStoryItem).filter_by(id="item-a", story_id="story-1").first() is not None


async def test_undo_redo_trim(db, data_dir):
    from backend.models import StoryItemTrim

    _seed(db, data_dir)
    assert stories.history_depth(db, "story-1") == {"undo": 0, "redo": 0}
    await stories.trim_story_item("story-1", "item-a", StoryItemTrim(trim_start_ms=100, trim_end_ms=0), db)
    assert db.query(DBStoryItem).filter_by(id="item-a").first().trim_start_ms == 100
    assert stories.history_depth(db, "story-1")["undo"] == 1

    assert stories.undo(db, "story-1") is True
    assert db.query(DBStoryItem).filter_by(id="item-a").first().trim_start_ms == 0

    assert stories.redo(db, "story-1") is True
    assert db.query(DBStoryItem).filter_by(id="item-a").first().trim_start_ms == 100


async def test_undo_empty_returns_false(db, data_dir):
    _seed(db, data_dir)
    assert stories.undo(db, "story-1") is False
    assert stories.redo(db, "story-1") is False


async def test_new_edit_clears_redo(db, data_dir):
    from backend.models import StoryItemTrim

    _seed(db, data_dir)
    await stories.trim_story_item("story-1", "item-a", StoryItemTrim(trim_start_ms=100, trim_end_ms=0), db)
    assert stories.undo(db, "story-1") is True
    await stories.trim_story_item("story-1", "item-a", StoryItemTrim(trim_start_ms=50, trim_end_ms=0), db)
    assert stories.history_depth(db, "story-1")["redo"] == 0


async def test_undo_restores_removed_item(db, data_dir):
    _seed(db, data_dir)
    assert await stories.remove_item_from_story("story-1", "item-b", db) is True
    assert len(_items(db)) == 1
    assert stories.undo(db, "story-1") is True
    assert sorted(i.id for i in _items(db)) == ["item-a", "item-b"]
