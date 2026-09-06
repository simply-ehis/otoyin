"""Tests for the songwriter draft endpoints (Resonant port)."""

import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.song_drafts import router


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
        "title": "Porch Light",
        "language": "en",
        "draft": {
            "language": "en",
            "title": "Porch Light",
            "idea": "Two friends avoid goodbye.",
            "hook": "Leave the porch light on",
            "pointOfView": "first-person",
            "tense": "present",
            "mood": "tender",
            "genre": "indie pop",
            "audience": "a friend",
            "imagery": "cardboard dust",
            "stylePrompt": "intimate, 92 BPM",
            "lyrics": "[Chorus]\nLeave the porch light on",
        },
    }
    body.update(overrides)
    return body


def test_create_and_get_round_trip():
    c = _client()
    created = c.post("/song-drafts", json=_payload())
    assert created.status_code == 200
    draft_id = created.json()["id"]
    assert created.json()["draft"]["hook"] == "Leave the porch light on"

    got = c.get(f"/song-drafts/{draft_id}")
    assert got.status_code == 200
    assert got.json()["title"] == "Porch Light"

    listed = c.get("/song-drafts").json()
    assert [d["id"] for d in listed] == [draft_id]


def test_update_replaces_body():
    c = _client()
    draft_id = c.post("/song-drafts", json=_payload()).json()["id"]

    payload = _payload(title="Afterimage")
    payload["draft"]["title"] = "Afterimage"
    updated = c.put(f"/song-drafts/{draft_id}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["title"] == "Afterimage"
    assert updated.json()["draft"]["title"] == "Afterimage"


def test_delete_removes_draft():
    c = _client()
    draft_id = c.post("/song-drafts", json=_payload()).json()["id"]
    assert c.delete(f"/song-drafts/{draft_id}").status_code == 204
    assert c.get(f"/song-drafts/{draft_id}").status_code == 404
    assert c.get("/song-drafts").json() == []


def test_unknown_draft_returns_404():
    c = _client()
    assert c.get("/song-drafts/nope").status_code == 404
    assert c.put("/song-drafts/nope", json=_payload()).status_code == 404
    assert c.delete("/song-drafts/nope").status_code == 404
