"""Tests for the cross-tab clipboard endpoints."""

import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.clipboard import router


def _client() -> TestClient:
    fd, path = tempfile.mkstemp(suffix=".db")
    import os

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


def test_put_then_get_round_trip():
    c = _client()
    put = c.put(
        "/clipboard",
        json={
            "kind": "sample",
            "entity_id": "abc-123",
            "name": "My Voice",
            "duration_ms": 4200,
            "audio_url": "/audio/sample.wav",
        },
    )
    assert put.status_code == 200
    assert put.json()["entity_id"] == "abc-123"

    get = c.get("/clipboard")
    assert get.status_code == 200
    body = get.json()
    assert body["kind"] == "sample"
    assert body["name"] == "My Voice"
    assert body["duration_ms"] == 4200
    assert body["audio_url"] == "/audio/sample.wav"


def test_put_replaces_existing_slot():
    c = _client()
    c.put("/clipboard", json={"kind": "capture", "entity_id": "first"})
    c.put("/clipboard", json={"kind": "generation", "entity_id": "second"})

    body = c.get("/clipboard").json()
    assert body["entity_id"] == "second"
    assert body["kind"] == "generation"


def test_get_empty_returns_404():
    c = _client()
    assert c.get("/clipboard").status_code == 404


def test_unknown_kind_rejected():
    c = _client()
    r = c.put("/clipboard", json={"kind": "not_a_kind", "entity_id": "x"})
    assert r.status_code == 400


def test_delete_clears_slot():
    c = _client()
    c.put("/clipboard", json={"kind": "sample", "entity_id": "abc"})
    assert c.delete("/clipboard").status_code == 204
    assert c.get("/clipboard").status_code == 404
