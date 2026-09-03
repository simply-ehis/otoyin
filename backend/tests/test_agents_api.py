"""HTTP-level integration tests for the vendored agent workspace APIs.

Exercises the real routers (projects + acquire) over FastAPI's TestClient with
an in-memory DB, proving the endpoints, DB wiring, and SSRF guard work end to
end (not just the service layer).
"""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import config
from backend.database import Base, get_db
from backend.routes import acquire as acquire_router, projects as projects_router


def _client(tmp_path: Path) -> TestClient:
    config.set_data_dir(tmp_path / "data")
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    app.include_router(projects_router.router)
    app.include_router(acquire_router.router)

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


def test_projects_and_plans_flow(tmp_path: Path):
    c = _client(tmp_path)

    # Create
    r = c.post("/projects", json={"name": "Album", "description": "demo"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    # List + get
    assert any(p["id"] == pid for p in c.get("/projects").json())
    assert c.get(f"/projects/{pid}").json()["name"] == "Album"

    # Source
    s = c.post(
        f"/projects/{pid}/sources",
        json={"name": "ref", "source_type": "url", "url": "https://example.com/a"},
    )
    assert s.status_code == 201, s.text
    assert len(c.get(f"/projects/{pid}/sources").json()) == 1

    # Context roots contain the project dir
    ctx = c.get(f"/projects/{pid}/context").json()
    assert any(pid in root for root in ctx["roots"])

    # Plan lifecycle
    p = c.post(f"/projects/{pid}/plans", json={"title": "Mix", "steps": ["a", "b"]})
    assert p.status_code == 201, p.text
    plan_id = p.json()["id"]
    assert len(c.get(f"/projects/{pid}/plans").json()) == 1

    upd = c.patch(f"/projects/{pid}/plans/{plan_id}/status", json={"status": "done"})
    assert upd.json()["status"] == "done"

    assert c.delete(f"/projects/{pid}/plans/{plan_id}").status_code == 200
    assert c.get(f"/projects/{pid}/plans").json() == []


def test_acquire_ssrf_blocked(tmp_path: Path):
    c = _client(tmp_path)
    r = c.post("/acquire/download", json={"source": "freesound", "url": "http://169.254.169.254/x"})
    assert r.status_code == 400
    assert "non-allowlisted" in r.text or "Blocked" in r.text


def test_acquire_success_writes_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import backend.agents.acquire.manager as mgr

    class _FakeResp:
        def __init__(self):
            self.status_code = 200
            self.headers = {}

        def raise_for_status(self):
            pass

        def iter_bytes(self):
            yield b"asset"

    monkeypatch.setattr(mgr.httpx, "get", lambda *a, **k: _FakeResp())

    c = _client(tmp_path)
    r = c.post(
        "/acquire/download",
        json={"source": "freesound", "url": "https://cdn.freesound.org/a/s.wav"},
    )
    assert r.status_code == 200, r.text
    local = config.resolve_storage_path(r.json()["local_path"])
    assert local is not None and local.exists()


def test_unknown_project_404(tmp_path: Path):
    c = _client(tmp_path)
    assert c.get("/projects/does-not-exist").status_code == 404
