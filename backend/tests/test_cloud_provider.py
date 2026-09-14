"""Tests for BYOK cloud-provider consumption (model_providers store -> httpx calls)."""

import contextlib
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models import Base
from backend.services import cloud_provider as cloud, model_providers as svc


def _make_db():
    import tempfile

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(path)
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine, path


def _cleanup(db, engine, path):
    db.close()
    engine.dispose()
    with contextlib.suppress(OSError):
        os.remove(path)


def test_get_cloud_provider_returns_none_without_default():
    db, engine, path = _make_db()
    try:
        assert cloud.get_cloud_provider("tts", db=db) is None
    finally:
        _cleanup(db, engine, path)


def test_get_cloud_provider_returns_decrypted_creds():
    db, engine, path = _make_db()
    try:
        svc.create_provider(
            db,
            domain="tts",
            name="CloudTTS",
            base_url="https://tts.example/v1",
            api_key="sk-topsecret",
            model="tts-1",
            is_default=True,
        )
        creds = cloud.get_cloud_provider("tts", db=db)
        assert creds["base_url"] == "https://tts.example/v1"
        assert creds["api_key"] == "sk-topsecret"
        assert creds["model"] == "tts-1"
    finally:
        _cleanup(db, engine, path)


def test_synthesize_via_cloud_tts_calls_speech_endpoint(monkeypatch):
    captured = {}

    class FakeResp:
        content = b"RIFF....WAVEDATA"
        status_code = 200

        def raise_for_status(self):
            return None

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResp()

    monkeypatch.setattr(cloud.httpx, "post", fake_post)
    # The SSRF guard would reject the fake host — httpx is faked, so bypass
    # the gate to exercise the request-building path for real.
    monkeypatch.setattr(cloud, "is_url_safe", lambda *a, **k: True)
    monkeypatch.setattr(
        cloud,
        "get_cloud_provider",
        lambda domain: {"base_url": "https://api.example/v1", "api_key": "k", "model": "tts-1"},
    )
    audio, ctype = cloud.synthesize_via_cloud_tts("tts", "Hello", voice="nova")
    assert audio == b"RIFF....WAVEDATA"
    assert ctype == "audio/wav"
    assert captured["url"].endswith("/audio/speech")
    assert captured["headers"]["Authorization"] == "Bearer k"
    assert captured["json"]["input"] == "Hello"
    assert captured["json"]["voice"] == "nova"


def test_synthesize_via_cloud_tts_raises_when_no_provider(monkeypatch):
    monkeypatch.setattr(cloud, "get_cloud_provider", lambda domain: None)
    try:
        cloud.synthesize_via_cloud_tts("tts", "Hi")
        raise AssertionError("expected LookupError")
    except LookupError:
        pass


def test_call_openai_chat_parses_content(monkeypatch):
    captured = {}

    class FakeResp:
        def __init__(self):
            self._json = {"choices": [{"message": {"content": "hi there"}}]}
            self.status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return self._json

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return FakeResp()

    monkeypatch.setattr(cloud.httpx, "post", fake_post)
    monkeypatch.setattr(cloud, "is_url_safe", lambda *a, **k: True)
    out = cloud.call_openai_chat("https://llm.example/v1", "k", "gpt", [{"role": "user", "content": "yo"}])
    assert out == "hi there"
    assert captured["url"].endswith("/chat/completions")
    assert captured["json"]["messages"][0]["content"] == "yo"
