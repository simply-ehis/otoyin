"""Tests for POST /profiles/preset-voice-preview (preset audition snippets)."""

import types

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.profiles import router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _cfg(engine="kokoro", model="kokoro-onnx", voices=("af_heart",)):
    return types.SimpleNamespace(
        engine=engine,
        model_name=model,
        model_size="default",
        structured_preset_voices=[
            types.SimpleNamespace(id=v, name=v, gender="female", language="en") for v in voices
        ],
    )


def test_unknown_engine_is_400(monkeypatch):
    monkeypatch.setattr("backend.backends.get_all_model_configs", lambda: [_cfg()])
    res = _client().post(
        "/profiles/preset-voice-preview", json={"engine": "nope", "voice_id": "af_heart"}
    )
    assert res.status_code == 400


def test_unknown_voice_is_400(monkeypatch):
    monkeypatch.setattr("backend.backends.get_all_model_configs", lambda: [_cfg()])
    res = _client().post(
        "/profiles/preset-voice-preview", json={"engine": "kokoro", "voice_id": "nope"}
    )
    assert res.status_code == 400


def test_missing_fields_are_400():
    res = _client().post(
        "/profiles/preset-voice-preview", json={"engine": "kokoro", "voice_id": "  "}
    )
    assert res.status_code == 400


def test_not_downloaded_model_is_400(monkeypatch):
    # No DB session configured → is_downloaded falls back to False.
    monkeypatch.setattr("backend.backends.get_all_model_configs", lambda: [_cfg()])
    res = _client().post(
        "/profiles/preset-voice-preview", json={"engine": "kokoro", "voice_id": "af_heart"}
    )
    assert res.status_code == 400


def test_synthesize_and_serve_from_cache(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.backends.get_all_model_configs", lambda: [_cfg()])
    monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a: True)

    async def _fake_load(engine, model_size="default"):
        return None

    calls = {"n": 0}

    class _FakeBackend:
        async def generate(self, text, voice_prompt, language="en", seed=None, **kwargs):
            calls["n"] += 1
            assert voice_prompt["preset_voice_id"] == "af_heart"
            return np.zeros(2400, dtype=np.float32), 24000

    monkeypatch.setattr("backend.backends.load_engine_model", _fake_load)
    monkeypatch.setattr(
        "backend.backends.get_tts_backend_for_engine", lambda engine: _FakeBackend()
    )
    monkeypatch.setattr("backend.config.get_data_dir", lambda: tmp_path)

    client = _client()
    body = {"engine": "kokoro", "voice_id": "af_heart"}
    first = client.post("/profiles/preset-voice-preview", json=body)
    assert first.status_code == 200, first.text
    assert first.headers["content-type"] == "audio/wav"
    assert len(first.content) > 44  # more than a bare WAV header

    cached = list(tmp_path.glob("previews/*.wav"))
    assert len(cached) == 1

    second = client.post("/profiles/preset-voice-preview", json=body)
    assert second.status_code == 200
    assert second.content == first.content
    assert calls["n"] == 1, "second audition must come from disk cache"


def test_engine_render_failure_is_422(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.backends.get_all_model_configs", lambda: [_cfg()])
    monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a: True)

    async def _fake_load(engine, model_size="default"):
        return None

    class _BrokenBackend:
        async def generate(self, *a, **k):
            raise RuntimeError("boom")

    monkeypatch.setattr("backend.backends.load_engine_model", _fake_load)
    monkeypatch.setattr(
        "backend.backends.get_tts_backend_for_engine", lambda engine: _BrokenBackend()
    )
    monkeypatch.setattr("backend.config.get_data_dir", lambda: tmp_path)

    res = _client().post(
        "/profiles/preset-voice-preview", json={"engine": "kokoro", "voice_id": "af_heart"}
    )
    assert res.status_code == 422
