"""Tests for instrument pack endpoints."""

import io
import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.instrument_packs import router


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


def test_list_empty():
    client = _client()
    res = client.get("/instrument-packs")
    assert res.status_code == 200
    assert res.json() == []


def test_upload_sample_file():
    client = _client()
    wav_content = b"RIFF" + b"\x00" * 100
    res = client.post(
        "/instrument-packs/upload",
        files={"file": ("kick.wav", io.BytesIO(wav_content), "audio/wav")},
        data={"name": "Kick Drum"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["pack"]["name"] == "Kick Drum"
    assert body["pack"]["format"] == "sample"
    assert body["instrument_count"] == 1
    assert body["pack"]["bytes"] == len(wav_content)


def test_upload_empty_file_returns_400():
    client = _client()
    res = client.post(
        "/instrument-packs/upload",
        files={"file": ("empty.wav", io.BytesIO(b""), "audio/wav")},
    )
    assert res.status_code == 400


def test_get_nonexistent_returns_404():
    client = _client()
    res = client.get("/instrument-packs/nonexistent")
    assert res.status_code == 404


def test_delete_removes_pack():
    client = _client()
    res = client.post(
        "/instrument-packs/upload",
        files={"file": ("test.wav", io.BytesIO(b"RIFF" + b"\x00" * 50), "audio/wav")},
        data={"name": "Test"},
    )
    pack_id = res.json()["pack"]["id"]
    res2 = client.delete(f"/instrument-packs/{pack_id}")
    assert res2.status_code == 204
    res3 = client.get(f"/instrument-packs/{pack_id}")
    assert res3.status_code == 404
