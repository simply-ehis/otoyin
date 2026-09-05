"""Tests for story export/import (.dstf.zip portability).

Covers: manifest shape + embedded voices, round-trip into a fresh DB with
new IDs, profile reuse on re-import, zip-bomb/traversal rejection, and the
empty-story failure. Mirrors the conventions in test_adr.py (temp SQLite)
and test_export_import_zip_limits.py (monkeypatched bounds).
"""

from __future__ import annotations

import io
import json
import tempfile
import wave
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import backend.config as cfg
from backend.database.models import (
    Base,
    Generation as DBGeneration,
    GenerationVersion as DBGenerationVersion,
    ProfileSample as DBProfileSample,
    Story as DBStory,
    StoryItem as DBStoryItem,
    VoiceProfile as DBVoiceProfile,
)
from backend.services import export_import as ei


def _wav(path: Path, seconds: float = 0.1, tone: bool = False) -> Path:
    import numpy as np

    rate = 16000
    n = int(rate * seconds)
    if tone:
        t = np.arange(n) / rate
        audio = (0.5 * np.sin(2 * np.pi * 440 * t) * 32767).astype("<i2")
    else:
        audio = (np.zeros(n) * 32767).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(audio.tobytes())
    return path


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """Point the backend data dir at a temp folder."""
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


def _seed_story(db: Session, data_dir: Path, name: str = "Trip"):
    """One cloned profile + sample, one generation + version, one story + 2 items."""
    gens = data_dir / "generations"
    prof = DBVoiceProfile(id="prof-1", name="Ada", language="en", voice_type="cloned")
    db.add(prof)
    db.commit()
    sample_path = gens / "sample.wav"
    _wav(sample_path, seconds=2.5, tone=True)
    db.add(DBProfileSample(id="samp-1", profile_id="prof-1", audio_path=str(sample_path), reference_text="hello"))
    gen_audio = gens / "gen-1.wav"
    _wav(gen_audio)
    db.add(
        DBGeneration(
            id="gen-1",
            profile_id="prof-1",
            text="hello world",
            language="en",
            audio_path=str(gen_audio),
            duration=0.1,
            engine="kokoro",
        )
    )
    ver_audio = gens / "ver-1.wav"
    _wav(ver_audio)
    db.add(
        DBGenerationVersion(
            id="ver-1", generation_id="gen-1", label="take 1", audio_path=str(ver_audio), is_default=True
        )
    )
    db.add(DBStory(id="story-1", name=name, description="d"))
    db.add(
        DBStoryItem(
            id="item-1",
            story_id="story-1",
            generation_id="gen-1",
            version_id="ver-1",
            start_time_ms=0,
            track=0,
            volume=0.8,
            pan=-0.5,
        )
    )
    db.add(
        DBStoryItem(
            id="item-2",
            story_id="story-1",
            generation_id="gen-1",
            version_id=None,
            start_time_ms=500,
            track=1,
        )
    )
    db.commit()
    return "story-1"


def test_export_manifest_shape(db, data_dir):
    _seed_story(db, data_dir)
    payload = ei.export_story_to_zip("story-1", db)
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        names = set(zf.namelist())
        assert "manifest.json" in names
        manifest = json.loads(zf.read("manifest.json"))
    assert manifest["story"]["name"] == "Trip"
    assert len(manifest["items"]) == 2
    assert manifest["items"][0]["volume"] == 0.8
    assert manifest["items"][0]["pan"] == -0.5
    assert manifest["items"][0]["version"] is not None
    assert manifest["items"][1]["version"] is None
    assert set(manifest["generations"]) == {"gen-1"}
    assert manifest["generations"]["gen-1"]["engine"] == "kokoro"
    assert set(manifest["versions"]) == {"ver-1"}
    assert manifest["versions"]["ver-1"]["is_default"] is True
    assert set(manifest["profiles"]) == {"prof-1"}
    assert manifest["profiles"]["prof-1"]["name"] == "Ada"
    assert len(manifest["profiles"]["prof-1"]["samples"]) == 1
    # Every referenced audio member is actually in the archive.
    for gen in manifest["generations"].values():
        assert gen["audio"] in names
    for ver in manifest["versions"].values():
        assert ver["audio"] in names


def test_roundtrip_into_fresh_db(db, data_dir, monkeypatch):
    _seed_story(db, data_dir)
    payload = ei.export_story_to_zip("story-1", db)

    import backend.services.noise_reduction as nr

    # Sample ingest denoises via DeepFilterNet (needs onnxruntime + weights);
    # bypass the DSP step here — ingest plumbing is what this test covers.
    monkeypatch.setattr(nr, "reduce_noise_deepfilternet", lambda audio, sr: audio)

    import os
    import tempfile

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    fresh = sessionmaker(bind=engine)()
    try:
        import asyncio

        result = asyncio.run(ei.import_story_from_zip(payload, fresh))
        assert result["items"] == 2
        assert result["generations"] == 1
        assert result["profiles_imported"] == 1
        assert result["profiles_reused"] == 0
        assert result["id"] != "story-1"  # new IDs, no collisions

        story = fresh.query(DBStory).filter_by(id=result["id"]).first()
        assert story is not None and story.name == "Trip"
        items = fresh.query(DBStoryItem).filter_by(story_id=result["id"]).all()
        assert len(items) == 2
        assert {i.track for i in items} == {0, 1}
        # Remapped generation IDs resolve to real rows with audio on disk.
        for item in items:
            gen = fresh.query(DBGeneration).filter_by(id=item.generation_id).first()
            assert gen is not None
            assert cfg.resolve_storage_path(gen.audio_path) is not None
            assert cfg.resolve_storage_path(gen.audio_path).exists()
            if item.version_id:
                ver = fresh.query(DBGenerationVersion).filter_by(id=item.version_id).first()
                assert ver is not None and ver.generation_id == gen.id
        prof = fresh.query(DBVoiceProfile).filter_by(name="Ada").first()
        assert prof is not None and prof.id != "prof-1"
        assert fresh.query(DBProfileSample).filter_by(profile_id=prof.id).count() == 1
    finally:
        fresh.close()
        engine.dispose()
        Path(path).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_reimport_reuses_voice_by_name(db, data_dir, monkeypatch):
    import backend.services.noise_reduction as nr

    monkeypatch.setattr(nr, "reduce_noise_deepfilternet", lambda audio, sr: audio)
    _seed_story(db, data_dir)
    payload = ei.export_story_to_zip("story-1", db)
    first = await ei.import_story_from_zip(payload, db)
    assert first["profiles_imported"] == 0  # "Ada" already here
    assert first["profiles_reused"] == 1
    assert db.query(DBVoiceProfile).filter_by(name="Ada").count() == 1


def test_export_empty_story_fails(db, data_dir):
    db.add(DBStory(id="empty-1", name="Empty"))
    db.commit()
    with pytest.raises(ValueError, match="no audio"):
        ei.export_story_to_zip("empty-1", db)


def test_export_missing_story_fails(db, data_dir):
    with pytest.raises(ValueError, match="not found"):
        ei.export_story_to_zip("nope", db)


@pytest.mark.asyncio
async def test_import_rejects_bad_manifest(db, data_dir, monkeypatch):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps({"version": "1.0"}))
    with pytest.raises(ValueError, match="missing story"):
        await ei.import_story_from_zip(buf.getvalue(), db)


@pytest.mark.asyncio
async def test_import_rejects_traversal_member(db, data_dir):
    _seed_story(db, data_dir)
    payload = ei.export_story_to_zip("story-1", db)
    manifest = json.loads(zipfile.ZipFile(io.BytesIO(payload)).read("manifest.json"))
    manifest["generations"]["gen-1"]["audio"] = "audio/../../evil.wav"
    buf = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(payload)) as src,
        zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf,
    ):
        for name in src.namelist():
            content = manifest if name == "manifest.json" else src.read(name)
            zf.writestr(name, json.dumps(content) if name == "manifest.json" else content)
    with pytest.raises(ValueError, match="Invalid archive audio path"):
        await ei.import_story_from_zip(buf.getvalue(), db)


@pytest.mark.asyncio
async def test_import_rejects_too_many_members(db, data_dir, monkeypatch):
    monkeypatch.setattr(ei, "MAX_ZIP_MEMBERS", 2)
    _seed_story(db, data_dir)
    payload = ei.export_story_to_zip("story-1", db)
    with pytest.raises(ValueError, match="too many entries"):
        await ei.import_story_from_zip(payload, db)
