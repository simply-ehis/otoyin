"""Tests for Comping / Mixer / Standalone project persistence (Steps 3b/3c/3d)."""

import json
import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.comping_sessions import router as comping_router
from backend.routes.mixer_sessions import router as mixer_router
from backend.routes.standalone import router as standalone_router


def _client(routers) -> TestClient:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    for r in routers:
        app.include_router(r)

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


def test_comping_session_hides_autosave():
    c = _client([comping_router])
    c.post("/comping/sessions", json={"name": "A", "data": {"lanes": []}, "is_autosave": True})
    assert c.get("/comping/sessions").json() == []
    assert len(c.get("/comping/sessions", params={"include_autosave": "true"}).json()) == 1


def test_comping_promote_names_row():
    c = _client([comping_router])
    created = c.post("/comping/sessions", json={"name": "A", "data": {"lanes": []}, "is_autosave": True}).json()
    promoted = c.post(f"/comping/sessions/{created['id']}/promote", json={"name": "My Comp", "data": {"lanes": [1]}})
    assert promoted.json()["name"] == "My Comp"
    assert promoted.json()["is_autosave"] is False
    assert len(c.get("/comping/sessions").json()) == 1


def test_mixer_session_roundtrip():
    c = _client([mixer_router])
    created = c.post("/mixer/sessions", json={"name": "Mix", "data": {"masterVolume": 0.8}}).json()
    listed = c.get("/mixer/sessions").json()
    assert listed[0]["data"]["masterVolume"] == 0.8
    updated = c.put(f"/mixer/sessions/{created['id']}", json={"data": {"masterVolume": 0.5}})
    assert updated.json()["data"]["masterVolume"] == 0.5


def test_standalone_project_persist_and_load():
    c = _client([standalone_router])
    created = c.post("/project/create", json={"name": "P", "fps": 24.0}).json()
    pid = created["project_id"]
    assert pid
    payload = {"project_id": pid, "project_json": json.dumps(created["project"])}
    c.post("/project/save", json=payload)
    loaded = c.post("/project/load", json={"project_id": pid}).json()
    assert loaded["project"]["id"] == pid
    assert loaded["project"]["name"] == "P"


def test_standalone_load_missing_404():
    c = _client([standalone_router])
    assert c.post("/project/load", json={"project_id": "nope"}).status_code == 404
