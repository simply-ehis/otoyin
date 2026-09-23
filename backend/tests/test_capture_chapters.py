"""Chapters endpoint: derived from the words sidecar, 404 when absent."""

import json
import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.captures import router


def _client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    app.include_router(router)

    def _override_get_db():
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app), session_local


def _seed_capture(session_local, tmp_path, with_words=True):
    import soundfile as sf

    from backend.database import Capture as DBCapture

    audio = tmp_path / "cap.wav"
    sf.write(str(audio), [0.0] * 16000, 16000)
    row = DBCapture(id="cap1", audio_path=str(audio), source="file", transcript_raw="a b")
    db = session_local()
    db.add(row)
    db.commit()
    db.close()
    if with_words:
        doc = {
            "text": "a b",
            "words": [
                {"text": "a", "start": 0.0, "end": 1.0, "type": "word", "speaker_id": "speaker_0"},
                {"text": "b", "start": 10.0, "end": 11.0, "type": "word", "speaker_id": "speaker_0"},
            ],
        }
        (tmp_path / "cap.words.json").write_text(json.dumps(doc))
    return audio


def test_chapters_from_sidecar(tmp_path):
    client, session_local = _client()
    _seed_capture(session_local, tmp_path, with_words=True)
    res = client.get("/captures/cap1/chapters")
    assert res.status_code == 200, res.text
    chapters = res.json()["chapters"]
    assert len(chapters) == 2
    assert chapters[0]["title"] == "a"
    assert chapters[1]["start"] == 10.0


def test_chapters_missing_capture_404():
    client, _ = _client()
    assert client.get("/captures/nope/chapters").status_code == 404


def test_chapters_missing_sidecar_404(tmp_path):
    client, session_local = _client()
    _seed_capture(session_local, tmp_path, with_words=False)
    assert client.get("/captures/cap1/chapters").status_code == 404


def test_words_endpoint_serves_sidecar(tmp_path):
    client, session_local = _client()
    _seed_capture(session_local, tmp_path, with_words=True)
    res = client.get("/captures/cap1/words")
    assert res.status_code == 200, res.text
    assert res.json()["text"] == "a b"


def test_words_endpoint_missing_sidecar_404(tmp_path):
    client, session_local = _client()
    _seed_capture(session_local, tmp_path, with_words=False)
    assert client.get("/captures/cap1/words").status_code == 404
