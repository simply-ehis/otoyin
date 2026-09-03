"""
Tests for POST /generations/from-audio — registering a stored clip as a
Generation so it can be pasted into a story timeline.
"""

import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import config
from backend.database import Base, get_db
from backend.database.models import VoiceProfile as DBVoiceProfile
from backend.routes import generations as generations_router


def _make_app():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    engine = create_engine(f"sqlite:///{tmp.name}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)

    # Seed one profile so the endpoint has something to attach to.
    with TestingSessionLocal() as db:
        db.add(
            DBVoiceProfile(
                id="prof_seed",
                name="Seed",
                language="en",
                voice_type="cloned",
            )
        )
        db.commit()

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(generations_router.router)
    app.dependency_overrides[get_db] = _override_get_db
    return app, TestingSessionLocal


def _write_clip():
    sr = 24000
    n = int(1.0 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    sig = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    out = config.get_exports_dir() / "from_audio_clip.wav"
    sf.write(str(out), sig, sr)
    return config.to_storage_path(out)


def test_create_generation_from_audio_registers_clip():
    app, _ = _make_app()
    client = TestClient(app)
    storage_path = _write_clip()

    resp = client.post(
        "/generations/from-audio",
        json={"audio_path": storage_path, "text": "Pasted clip", "profile_id": "prof_seed"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["audio_path"] == storage_path
    assert body["duration"] == 1.0
    assert body["engine"] == "import"
    assert body["profile_id"] == "prof_seed"


def test_create_generation_from_audio_rejects_missing_file():
    app, _ = _make_app()
    client = TestClient(app)
    resp = client.post(
        "/generations/from-audio",
        json={"audio_path": "exports/does_not_exist.wav"},
    )
    assert resp.status_code == 404
