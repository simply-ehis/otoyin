"""Tests for vocal QA route — WER computation + endpoint."""

import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.vocal_qa import _coverage, _normalise, _wer, router


def _client() -> TestClient:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(
        f"sqlite:///{path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    app = FastAPI()
    app.include_router(router)

    def _override():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


# ─── Unit tests for helpers ──────────────────────────────────────────────────


def test_normalise():
    assert _normalise("Hello, World!") == ["hello", "world"]
    assert _normalise("it's a test") == ["it", "s", "a", "test"]
    assert _normalise("") == []


def test_wer_perfect():
    ref = ["hello", "world"]
    hyp = ["hello", "world"]
    wer, missing, extra = _wer(ref, hyp)
    assert wer == 0.0
    assert missing == []
    assert extra == []


def test_wer_substitution():
    ref = ["hello", "world"]
    hyp = ["hello", "earth"]
    wer, missing, extra = _wer(ref, hyp)
    assert wer == 0.5
    assert missing == ["world"]
    assert extra == ["earth"]


def test_wer_deletion():
    ref = ["hello", "world"]
    hyp = ["hello"]
    wer, missing, extra = _wer(ref, hyp)
    assert wer == 0.5
    assert missing == ["world"]
    assert extra == []


def test_wer_insertion():
    ref = ["hello"]
    hyp = ["hello", "world"]
    wer, missing, extra = _wer(ref, hyp)
    assert wer == 1.0
    assert missing == []
    assert extra == ["world"]


def test_wer_empty_ref():
    wer, missing, extra = _wer([], ["hello"])
    assert wer == 0.0
    assert missing == []
    assert extra == ["hello"]


def test_coverage_perfect():
    assert _coverage(["a", "b", "c"], ["c", "a", "b"]) == 100.0


def test_coverage_partial():
    assert abs(_coverage(["a", "b", "c"], ["a", "x"]) - 33.33) < 0.1


def test_coverage_empty():
    assert _coverage([], ["a"]) == 100.0


# ─── Endpoint tests ──────────────────────────────────────────────────────────


def test_vocal_qa_missing_generation_returns_404():
    client = _client()
    with patch("backend.routes.vocal_qa.history") as mock_hist:
        mock_hist.get_generation = AsyncMock(return_value=None)
        res = client.post(
            "/audio/vocal-qa",
            json={"generation_id": "nonexistent", "lyrics": "hello world"},
        )
    assert res.status_code == 404


def test_vocal_qa_with_mock_stt():
    client = _client()
    # Create a dummy audio file
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        with open(path, "wb") as f:
            f.write(b"RIFF" + b"\x00" * 100)

        from backend import config

        rel_path = str(config.to_storage_path(path))

        mock_generation = MagicMock()
        mock_generation.audio_path = rel_path

        mock_words = [
            {"word": "Hello", "start_ms": 0.0, "end_ms": 500.0, "confidence": 0.95},
            {"word": "world", "start_ms": 600.0, "end_ms": 1100.0, "confidence": 0.92},
        ]
        mock_stt = AsyncMock()
        mock_stt.transcribe_with_words.return_value = mock_words

        with (
            patch("backend.routes.vocal_qa.history") as mock_hist,
            patch("backend.backends.registry.get_stt_backend", return_value=mock_stt),
        ):
            mock_hist.get_generation = AsyncMock(return_value=mock_generation)
            res = client.post(
                "/audio/vocal-qa",
                json={"generation_id": "gen-123", "lyrics": "Hello world"},
            )

        assert res.status_code == 200
        body = res.json()
        assert body["wer"] == 0.0
        assert body["coverage_pct"] == 100.0
        assert body["missing_words"] == []
        assert body["word_count_ref"] == 2
        assert len(body["words"]) == 2
    finally:
        os.unlink(path)
