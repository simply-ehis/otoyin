"""Tests for the rolling autosave snapshot system (5-slot undo stack).

Covers:
  - INSERT + prune (keeps only 5 newest snapshots per session)
  - LIST snapshots (newest first)
  - UNDO (restores session from latest snapshot, consumes it)
  - DELETE session cascades to snapshots
  - PROMOTE (named save) deletes all snapshots
"""

import os
import tempfile
import time

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


def _create_session(c: TestClient) -> str:
    resp = c.post("/audio-studio/sessions", json={"name": "Test", "data": {"tracks": []}})
    assert resp.status_code == 200
    return resp.json()["id"]


def _snapshot_count(c: TestClient, sid: str) -> int:
    resp = c.get(f"/audio-studio/sessions/{sid}/autosave-snapshots")
    assert resp.status_code == 200
    return len(resp.json())


# ── INSERT + prune ──────────────────────────────────────────────────────


def test_insert_snapshot():
    c = _client()
    sid = _create_session(c)
    resp = c.post(
        f"/audio-studio/sessions/{sid}/autosave-snapshot",
        json={"data": {"tracks": [{"name": "v1"}]}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == sid
    assert body["data"]["tracks"][0]["name"] == "v1"
    assert body["id"]


def test_list_snapshots_newest_first():
    c = _client()
    sid = _create_session(c)
    for i in range(3):
        c.post(
            f"/audio-studio/sessions/{sid}/autosave-snapshot",
            json={"data": {"version": i}},
        )
        time.sleep(0.01)
    resp = c.get(f"/audio-studio/sessions/{sid}/autosave-snapshots")
    assert resp.status_code == 200
    snaps = resp.json()
    assert len(snaps) == 3
    assert snaps[0]["data"]["version"] == 2
    assert snaps[2]["data"]["version"] == 0


def test_prune_keeps_only_5():
    c = _client()
    sid = _create_session(c)
    for i in range(8):
        c.post(
            f"/audio-studio/sessions/{sid}/autosave-snapshot",
            json={"data": {"version": i}},
        )
        time.sleep(0.01)
    assert _snapshot_count(c, sid) == 5
    resp = c.get(f"/audio-studio/sessions/{sid}/autosave-snapshots")
    versions = [s["data"]["version"] for s in resp.json()]
    assert versions == [7, 6, 5, 4, 3]


def test_insert_to_nonexistent_session_404():
    c = _client()
    resp = c.post(
        "/audio-studio/sessions/nonexistent/autosave-snapshot",
        json={"data": {}},
    )
    assert resp.status_code == 404


# ── UNDO ────────────────────────────────────────────────────────────────


def test_undo_restores_latest_snapshot():
    c = _client()
    sid = _create_session(c)
    c.post(
        f"/audio-studio/sessions/{sid}/autosave-snapshot",
        json={"data": {"tracks": [{"name": "first"}]}},
    )
    time.sleep(0.01)
    c.post(
        f"/audio-studio/sessions/{sid}/autosave-snapshot",
        json={"data": {"tracks": [{"name": "second"}]}},
    )
    resp = c.post(f"/audio-studio/sessions/{sid}/undo-autosave")
    assert resp.status_code == 200
    assert resp.json()["data"]["tracks"][0]["name"] == "second"
    assert _snapshot_count(c, sid) == 1


def test_undo_consumes_snapshot():
    c = _client()
    sid = _create_session(c)
    c.post(
        f"/audio-studio/sessions/{sid}/autosave-snapshot",
        json={"data": {"version": 1}},
    )
    c.post(f"/audio-studio/sessions/{sid}/undo-autosave")
    assert _snapshot_count(c, sid) == 0


def test_undo_with_no_snapshots_404():
    c = _client()
    sid = _create_session(c)
    resp = c.post(f"/audio-studio/sessions/{sid}/undo-autosave")
    assert resp.status_code == 404


def test_undo_nonexistent_session_404():
    c = _client()
    resp = c.post("/audio-studio/sessions/nonexistent/undo-autosave")
    assert resp.status_code == 404


# ── PROMOTE deletes snapshots ──────────────────────────────────────────


def test_promote_clears_all_snapshots():
    c = _client()
    sid = _create_session(c)
    for i in range(3):
        c.post(
            f"/audio-studio/sessions/{sid}/autosave-snapshot",
            json={"data": {"version": i}},
        )
    assert _snapshot_count(c, sid) == 3
    resp = c.post(
        f"/audio-studio/sessions/{sid}/promote",
        json={"name": "My Session", "data": {"final": True}},
    )
    assert resp.status_code == 200
    assert resp.json()["is_autosave"] is False
    assert _snapshot_count(c, sid) == 0


# ── DELETE cascades to snapshots ───────────────────────────────────────


def test_delete_cascades_to_snapshots():
    c = _client()
    sid = _create_session(c)
    for i in range(3):
        c.post(
            f"/audio-studio/sessions/{sid}/autosave-snapshot",
            json={"data": {"v": i}},
        )
    assert _snapshot_count(c, sid) == 3
    resp = c.delete(f"/audio-studio/sessions/{sid}")
    assert resp.status_code == 200
    resp = c.get(f"/audio-studio/sessions/{sid}/autosave-snapshots")
    assert resp.status_code == 200
    assert len(resp.json()) == 0
