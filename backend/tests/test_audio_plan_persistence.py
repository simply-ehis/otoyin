"""Audio plan persistence — survives restarts (BUG found via audit note).

The backend used to hold plans in a process-local dict, so a restart wiped
voice/engine edits until the user regenerated the plan. Plans are now also
persisted to ``data/plans/<id>.json`` (atomic via tmp + replace), and reads
fall back from memory to disk.
"""

import asyncio

import pytest

from backend import config
from backend.routes import audio_plan
from backend.services import audio_plan as svc


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "_data_dir", tmp_path)
    return tmp_path


def _sample_plan() -> svc.AudioPlan:
    plan = svc.generate_auto_plan(
        [
            {
                "id": "s1",
                "name": "Scene 1",
                "duration": 10.0,
                "dialogue": [{"character": "ALICE", "text": "Hello world."}],
            }
        ],
        [],
        24.0,
    )
    for scene in plan.scenes:
        for track in scene.tracks:
            if track.dialogue_line is None:
                continue
            track.dialogue_line.voice_profile_id = "voice-1"
            track.dialogue_line.engine = "kokoro"
    return plan


def test_roundtrip_persists_voice_and_engine(data_dir):
    plan = _sample_plan()
    svc.save_plan_to_disk(plan)
    assert (data_dir / "plans" / "auto-plan.json").is_file()

    loaded = svc.load_plan_from_disk("auto-plan")
    assert loaded is not None
    assert loaded.id == plan.id
    track = next(t for s in loaded.scenes for t in s.tracks)
    assert track.dialogue_line.voice_profile_id == "voice-1"
    assert track.dialogue_line.engine == "kokoro"


def test_atomic_write_leaves_no_tmp_file(data_dir):
    plan = _sample_plan()
    svc.save_plan_to_disk(plan)
    leftovers = list((data_dir / "plans").glob("*.tmp"))
    assert leftovers == []


def test_safe_plan_id_rejects_traversal(data_dir):
    with pytest.raises(ValueError):
        svc.save_plan_to_disk(svc.AudioPlan(id="../escape", movie_title="x"))
    assert svc.load_plan_from_disk("../escape") is None


def test_route_falls_back_to_disk_after_restart(data_dir, monkeypatch):
    """Simulate a restart: clear the in-memory cache, keep the disk file."""
    plan = _sample_plan()
    svc.save_plan_to_disk(plan)

    monkeypatch.setattr(audio_plan, "PLANS", {})
    restored = audio_plan._get_plan("auto-plan")
    assert restored.id == "auto-plan"
    track = next(t for s in restored.scenes for t in s.tracks)
    assert track.dialogue_line.voice_profile_id == "voice-1"


def test_missing_plan_raises_404_after_restart(data_dir, monkeypatch):
    from fastapi import HTTPException

    monkeypatch.setattr(audio_plan, "PLANS", {})
    with pytest.raises(HTTPException) as excinfo:
        audio_plan._get_plan("nope")
    assert excinfo.value.status_code == 404


def test_route_update_persists_to_disk(data_dir, monkeypatch):
    """Simulate a restart followed by an edit: edit must reach disk."""
    plan = _sample_plan()
    svc.save_plan_to_disk(plan)

    # Simulate restart: memory empty, disk has the plan
    monkeypatch.setattr(audio_plan, "PLANS", {})

    track = next(t for s in plan.scenes for t in s.tracks if t.dialogue_line is not None)
    update = audio_plan.PlanTrackUpdate(
        track_id=track.id,
        voice_profile_id="voice-2",
        engine="xtts",
    )
    response = asyncio.run(audio_plan.update_plan_track(update))
    assert response["track_id"] == track.id

    on_disk = svc.load_plan_from_disk("auto-plan")
    assert on_disk is not None
    saved = next(t for s in on_disk.scenes for t in s.tracks if t.dialogue_line is not None)
    assert saved.dialogue_line.voice_profile_id == "voice-2"
    assert saved.dialogue_line.engine == "xtts"


def test_create_persists_to_disk(data_dir, monkeypatch):
    monkeypatch.setattr(audio_plan, "PLANS", {})

    scene = {
        "id": "sc1",
        "name": "Scene 1",
        "duration": 5.0,
        "dialogue": [{"character": "ALICE", "text": "Hi.", "emotion": "neutral"}],
    }
    response = asyncio.run(
        audio_plan.create_auto_plan(
            audio_plan.AutoPlanRequest(scenes=[audio_plan.SceneInput(**scene)], characters=[], fps=24.0)
        )
    )
    assert "plan_json" in response
    on_disk = svc.load_plan_from_disk("auto-plan")
    assert on_disk is not None
    track = next(t for s in on_disk.scenes for t in s.tracks if t.dialogue_line is not None)
    assert track.dialogue_line is not None
    assert track.dialogue_line.engine is None  # user picks later; absent, not invented
