"""Tests for Audio Studio session persistence + autosave/promote flow."""

import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.audio_studio import router


def _client() -> TestClient:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
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


def test_autosave_row_is_hidden_from_list():
    c = _client()
    created = c.post("/audio-studio/sessions", json={"name": "Autosave", "data": {"x": 1}, "is_autosave": True})
    assert created.status_code == 200
    assert created.json()["is_autosave"] is True

    listed = c.get("/audio-studio/sessions").json()
    assert listed == [], "autosave rows must be hidden by default"

    shown = c.get("/audio-studio/sessions", params={"include_autosave": "true"}).json()
    assert len(shown) == 1


def test_promote_names_and_unhides_row():
    c = _client()
    created = c.post("/audio-studio/sessions", json={"name": "Autosave", "data": {"x": 1}, "is_autosave": True}).json()

    promoted = c.post(f"/audio-studio/sessions/{created['id']}/promote", json={"name": "My Mix", "data": {"x": 2}})
    assert promoted.status_code == 200
    body = promoted.json()
    assert body["name"] == "My Mix"
    assert body["is_autosave"] is False

    listed = c.get("/audio-studio/sessions").json()
    assert len(listed) == 1
    assert listed[0]["name"] == "My Mix"


def test_update_overwrites_data():
    c = _client()
    created = c.post("/audio-studio/sessions", json={"name": "S", "data": {"v": 1}}).json()
    updated = c.put(f"/audio-studio/sessions/{created['id']}", json={"data": {"v": 99}})
    assert updated.status_code == 200
    assert updated.json()["data"]["v"] == 99
