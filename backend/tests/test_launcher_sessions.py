"""Tests for launcher session endpoints (clip grid + scenes, ported from Resonant)."""

import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.launcher_sessions import router


def _client() -> TestClient:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    app.include_router(router)

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


def _payload(**overrides):
    body = {
        "name": "Test Beat",
        "session": {
            "name": "Test Beat",
            "bpm": 128.0,
            "masterVolume": 0.9,
            "tracks": [
                {
                    "id": "track-1",
                    "name": "Drums",
                    "kind": "drum",
                    "color": "#ff6b86",
                    "volume": 0.8,
                    "pan": 0.0,
                    "mute": False,
                    "solo": False,
                    "sessionSlots": ["clip-1", None, None, None],
                }
            ],
            "clips": {
                "clip-1": {
                    "id": "clip-1",
                    "type": "audio",
                    "name": "Kick loop",
                    "color": "#ff6b86",
                    "lengthBeats": 4.0,
                    "sampleRate": 44100,
                    "channels": 2,
                    "frames": 176400,
                    "audioPath": "/api/audio/kick.wav",
                    "trimStart": 0.0,
                    "trimEnd": 0.0,
                    "gain": 1.0,
                    "volumeAutomation": [1.0] * 16,
                }
            },
            "numScenes": 4,
        },
    }
    body.update(overrides)
    return body


def test_create_and_get_round_trip():
    client = _client()
    res = client.post("/launcher/sessions", json=_payload())
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Test Beat"
    assert body["session"]["bpm"] == 128.0
    assert len(body["session"]["tracks"]) == 1
    assert body["session"]["tracks"][0]["name"] == "Drums"
    assert body["session"]["clips"]["clip-1"]["audioPath"] == "/api/audio/kick.wav"
    sid = body["id"]

    res2 = client.get(f"/launcher/sessions/{sid}")
    assert res2.status_code == 200
    assert res2.json()["session"]["bpm"] == 128.0


def test_list_sessions():
    client = _client()
    client.post("/launcher/sessions", json=_payload())
    res = client.get("/launcher/sessions")
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_update_replaces_session():
    client = _client()
    res = client.post("/launcher/sessions", json=_payload())
    sid = res.json()["id"]
    updated = _payload(name="Updated Beat")
    updated["session"] = {**_payload()["session"], "bpm": 140.0}
    res2 = client.put(f"/launcher/sessions/{sid}", json=updated)
    assert res2.status_code == 200
    assert res2.json()["name"] == "Updated Beat"
    assert res2.json()["session"]["bpm"] == 140.0


def test_delete_removes_session():
    client = _client()
    res = client.post("/launcher/sessions", json=_payload())
    sid = res.json()["id"]
    res2 = client.delete(f"/launcher/sessions/{sid}")
    assert res2.status_code == 204
    res3 = client.get(f"/launcher/sessions/{sid}")
    assert res3.status_code == 404


def test_get_nonexistent_returns_404():
    client = _client()
    res = client.get("/launcher/sessions/nonexistent-id")
    assert res.status_code == 404


def test_create_default_session():
    client = _client()
    res = client.post("/launcher/sessions", json={"name": "", "session": {}})
    assert res.status_code == 200
    body = res.json()
    assert body["session"]["bpm"] == 120.0
    assert body["session"]["masterVolume"] == 0.84
    assert body["session"]["numScenes"] == 4


def test_capture_nonexistent_session_returns_404():
    client = _client()
    res = client.post(
        "/launcher/sessions/nonexistent-id/capture",
        json={"activeClips": None},
    )
    assert res.status_code == 404


def test_capture_session_no_active_clips_returns_400():
    client = _client()
    res = client.post("/launcher/sessions", json=_payload())
    sid = res.json()["id"]
    res2 = client.post(
        f"/launcher/sessions/{sid}/capture",
        json={"activeClips": {"track-1": "clip-1"}},
    )
    assert res2.status_code == 400
