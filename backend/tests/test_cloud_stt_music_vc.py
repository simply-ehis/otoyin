"""Tests for cloud STT, music generation, and voice conversion paths."""

import contextlib
import os
import tempfile
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import app
from backend.database.models import Base
from backend.services import cloud_provider as cloud


# Patch app readiness for TestClient
@pytest.fixture(autouse=True)
def _ready(monkeypatch):
    import backend.app as app_module

    monkeypatch.setattr(app_module, "_is_ready", lambda: True)


@pytest.fixture(autouse=True)
def _clear_backend_cache():
    """Clear backend instance caches between tests to avoid state leakage."""
    import backend.backends.registry as registry

    # Clear music backend cache
    if hasattr(registry, "_music_backends"):
        registry._music_backends.clear()
    # Clear VC backend cache
    if hasattr(registry, "_vc_backends"):
        registry._vc_backends.clear()
    yield
    # Clear again after test
    if hasattr(registry, "_music_backends"):
        registry._music_backends.clear()
    if hasattr(registry, "_vc_backends"):
        registry._vc_backends.clear()


def _wav_bytes():
    rate = 16000
    duration = 0.5
    t = np.linspace(0, duration, int(rate * duration), endpoint=False)
    audio = (np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)
    import io
    import wave

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


def _wav_path():
    """Create a temp WAV file and return its path."""
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    with open(path, "wb") as f:
        f.write(_wav_bytes())
    return path


def _make_db():
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


class FakeResp:
    def __init__(self, json_data, content=b""):
        self._json = json_data
        self.content = content
        self.status_code = 200

    def json(self):
        return self._json

    def raise_for_status(self):
        pass


# ---- Unit tests for cloud_provider functions (mock get_cloud_provider) ----


def test_transcribe_via_cloud_calls_transcriptions():
    with (
        patch("backend.services.cloud_provider.get_cloud_provider") as mock_get,
        patch("backend.services.cloud_provider.is_url_safe", return_value=True),
        patch("backend.services.cloud_provider.httpx.post") as mock_post,
    ):
        mock_get.return_value = {"base_url": "https://api.example.com", "api_key": "sk-test", "model": "whisper-1"}
        mock_post.return_value = FakeResp({"text": "hello world"})
        text = cloud.transcribe_via_cloud(_wav_path(), language="en")
        assert text == "hello world"
        mock_post.assert_called_once()
        mock_get.assert_called_once_with("stt")


def test_transcribe_via_cloud_raises_when_no_provider():
    with patch("backend.services.cloud_provider.get_cloud_provider") as mock_get:
        mock_get.return_value = None
        with pytest.raises(LookupError):
            cloud.transcribe_via_cloud(_wav_path(), language="en")


def test_generate_music_via_cloud_decodes_audio():
    fake_audio = _wav_bytes()
    with (
        patch("backend.services.cloud_provider.get_cloud_provider") as mock_get,
        patch("backend.services.cloud_provider.is_url_safe", return_value=True),
        patch("backend.services.cloud_provider.httpx.post") as mock_post,
    ):
        mock_get.return_value = {"base_url": "https://api.example.com", "api_key": "sk-test", "model": "music-1"}
        mock_post.return_value = FakeResp({}, content=fake_audio)
        audio, sr = cloud.generate_music_via_cloud(prompt="test", duration_seconds=10)
        assert isinstance(audio, np.ndarray)
        assert sr == 16000
        mock_post.assert_called_once()
        mock_get.assert_called_once_with("music")


def test_generate_music_via_cloud_raises_when_no_provider():
    with patch("backend.services.cloud_provider.get_cloud_provider") as mock_get:
        mock_get.return_value = None
        with pytest.raises(LookupError):
            cloud.generate_music_via_cloud(prompt="test")


def test_convert_voice_via_cloud_decodes_audio():
    fake_audio = _wav_bytes()
    with (
        patch("backend.services.cloud_provider.get_cloud_provider") as mock_get,
        patch("backend.services.cloud_provider.is_url_safe", return_value=True),
        patch("backend.services.cloud_provider.httpx.post") as mock_post,
    ):
        mock_get.return_value = {"base_url": "https://api.example.com", "api_key": "sk-test", "model": "vc-1"}
        mock_post.return_value = FakeResp({}, content=fake_audio)
        audio, sr = cloud.convert_voice_via_cloud(np.zeros(16000, dtype=np.float32), 16000, "voice_name")
        assert isinstance(audio, np.ndarray)
        assert sr == 16000
        mock_post.assert_called_once()
        mock_get.assert_called_once_with("vc")


def test_convert_voice_via_cloud_raises_when_no_provider():
    with patch("backend.services.cloud_provider.get_cloud_provider") as mock_get:
        mock_get.return_value = None
        with pytest.raises(LookupError):
            cloud.convert_voice_via_cloud(np.zeros(16000, dtype=np.float32), 16000, "voice")


def test_cloud_music_backend_generate():
    with patch("backend.backends.cloud_music_backend.generate_music_via_cloud") as mock_gen:
        mock_gen.return_value = (np.zeros(16000, dtype=np.float32), 16000)
        from backend.backends.cloud_music_backend import CloudMusicBackend

        backend = CloudMusicBackend()
        audio, sr = backend.generate(prompt="test", duration_seconds=5)
        assert isinstance(audio, np.ndarray)
        assert sr == 16000
        mock_gen.assert_called_once()


def test_cloud_vc_backend_convert():
    with patch("backend.backends.cloud_vc_backend.convert_voice_via_cloud") as mock_conv:
        mock_conv.return_value = (np.zeros(16000, dtype=np.float32), 16000)
        from backend.backends.cloud_vc_backend import CloudVCBackend

        backend = CloudVCBackend()
        audio, sr = backend.convert(np.zeros(16000, dtype=np.float32), 16000, "voice_name")
        assert isinstance(audio, np.ndarray)
        assert sr == 16000
        mock_conv.assert_called_once()


# ---- Route tests (require proper app dependency overrides) ----
# These tests use the real app with TestClient. Since the app uses
# a real database session, we need to ensure the cloud provider
# lookup works. The simplest approach is to mock at the cloud_provider
# module level which the routes import.
# Also patch _is_ready to bypass the background startup wait.


def _patch_ready():
    import backend.app as app_module

    app_module._signal_ready()


def test_transcribe_route_cloud_no_provider():
    client = TestClient(app)
    with patch("backend.services.cloud_provider.get_cloud_provider") as mock_get:
        mock_get.return_value = None
        resp = client.post(
            "/transcribe",
            files={"file": ("test.wav", _wav_bytes(), "audio/wav")},
            data={"language": "en", "model": "cloud"},
        )
        assert resp.status_code == 400
        assert "No cloud provider configured" in resp.json()["detail"]


def test_transcribe_route_cloud():
    client = TestClient(app)
    with (
        patch("backend.services.cloud_provider.get_cloud_provider") as mock_get,
        patch("backend.services.cloud_provider.is_url_safe", return_value=True),
        patch("backend.services.cloud_provider.httpx.post") as mock_post,
    ):
        mock_get.return_value = {"base_url": "https://api.example.com", "api_key": "sk-test", "model": "whisper-1"}
        mock_post.return_value = FakeResp({"text": "route ok"})
        resp = client.post(
            "/transcribe",
            files={"file": ("test.wav", _wav_bytes(), "audio/wav")},
            data={"language": "en", "model": "cloud"},
        )
        assert resp.status_code == 200
        assert resp.json()["text"] == "route ok"


def test_generate_music_route_cloud_no_provider():
    client = TestClient(app)
    with patch("backend.services.cloud_provider.get_cloud_provider") as mock_get:
        mock_get.return_value = None
        resp = client.post("/generate/music", json={"prompt": "test", "engine": "cloud", "duration_seconds": 5})
        assert resp.status_code == 400
        assert "No cloud provider configured" in resp.json()["detail"]


def test_generate_music_route_cloud():
    client = TestClient(app)
    # Patch the backend class method directly to avoid background thread mock issues
    with patch("backend.backends.cloud_music_backend.CloudMusicBackend.generate") as mock_gen:
        mock_gen.return_value = (np.zeros(16000, dtype=np.float32), 16000)
        resp = client.post("/generate/music", json={"prompt": "test", "engine": "cloud", "duration_seconds": 5})
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"


def test_voice_convert_route_cloud_no_provider():
    client = TestClient(app)
    # Patch the backend class method to raise LookupError (which the route converts to 400)
    with patch("backend.backends.cloud_vc_backend.CloudVCBackend.convert") as mock_conv:

        def raise_lookup(*args, **kwargs):
            raise LookupError("No cloud provider configured for domain 'vc'")

        mock_conv.side_effect = raise_lookup
        with patch("backend.config.resolve_storage_path") as mock_resolve:
            from pathlib import Path

            mock_path = Path(_wav_path())
            mock_resolve.return_value = mock_path
            try:
                resp = client.post(
                    "/voice-convert",
                    json={
                        "audio_path": "test.wav",
                        "engine": "cloud",
                        "consent_given": True,
                        "voice_pack": "test_voice",
                    },
                )
                assert resp.status_code == 400
                assert "No cloud provider configured" in resp.json()["detail"]
            finally:
                mock_path.unlink(missing_ok=True)


def test_voice_convert_requires_consent():
    client = TestClient(app)
    resp = client.post(
        "/voice-convert",
        json={
            "audio_path": "test.wav",
            "engine": "rvc",
        },
    )
    assert resp.status_code == 400
    assert "Consent is required" in resp.json()["detail"]


def test_voice_convert_route_cloud():
    client = TestClient(app)
    # Patch the backend class method directly to avoid background thread mock issues
    with patch("backend.backends.cloud_vc_backend.CloudVCBackend.convert") as mock_conv:
        mock_conv.return_value = (np.zeros(16000, dtype=np.float32), 16000)
        with patch("backend.config.resolve_storage_path") as mock_resolve:
            from pathlib import Path

            mock_path = Path(_wav_path())
            mock_resolve.return_value = mock_path
            try:
                resp = client.post(
                    "/voice-convert",
                    json={
                        "audio_path": "test.wav",
                        "engine": "cloud",
                        "consent_given": True,
                        "voice_pack": "test_voice",
                    },
                )
                assert resp.status_code == 200
                assert resp.headers["content-type"] == "audio/wav"
            finally:
                mock_path.unlink(missing_ok=True)
