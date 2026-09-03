"""Tests for the audio enhancer service and route."""

import numpy as np
import pytest
from fastapi.testclient import TestClient


def _require_deepfilternet():
    """Skip the test if DeepFilterNet ONNX is not available or weights are not downloaded."""
    try:
        from backend.services.deepfilter_onnx import _is_model_cached, is_onnx_available

        if not is_onnx_available():
            pytest.skip("DeepFilterNet ONNX not available")
        if not _is_model_cached():
            pytest.skip("DeepFilterNet ONNX weights not downloaded")
    except ImportError:
        pytest.skip("DeepFilterNet ONNX not installed")


def _require_soundfile():
    """Skip the test if soundfile is not installed."""
    pytest.importorskip("soundfile")


@pytest.fixture
def client():
    """Build a minimal app with the features router."""
    from fastapi import FastAPI

    from backend.routes.features import router as features_router

    app = FastAPI()
    app.include_router(features_router)
    return TestClient(app)


class TestAudioEnhancer:
    """Test the audio_enhancer service layer."""

    def test_enhance_mode_enum(self):
        from backend.services.audio_enhancer import EnhanceMode

        assert EnhanceMode.AUTO == "auto"
        assert EnhanceMode.LAVASR == "lavasr"
        assert EnhanceMode.DENOISE == "denoise"

    def test_is_lavasr_available_returns_bool(self):
        from backend.services.audio_enhancer import is_lavasr_available

        result = is_lavasr_available()
        assert isinstance(result, bool)

    def test_enhance_audio_denoise_only(self):
        _require_deepfilternet()
        from backend.services.audio_enhancer import EnhanceMode, enhance_audio

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32) * 0.5
        enhanced, _sr = enhance_audio(audio, 16000, mode=EnhanceMode.DENOISE)
        assert isinstance(enhanced, np.ndarray)
        assert len(enhanced) > 0

    def test_enhance_audio_mono_input(self):
        _require_deepfilternet()
        from backend.services.audio_enhancer import EnhanceMode, enhance_audio

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32)
        enhanced, _sr = enhance_audio(audio, 16000, mode=EnhanceMode.DENOISE)
        assert isinstance(enhanced, np.ndarray)
        assert enhanced.ndim == 1

    def test_enhance_audio_stereo_converts_to_mono(self):
        _require_deepfilternet()
        from backend.services.audio_enhancer import EnhanceMode, enhance_audio

        mono = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32)
        stereo = np.stack([mono, mono], axis=1)
        enhanced, _sr = enhance_audio(stereo, 16000, mode=EnhanceMode.DENOISE)
        assert enhanced.ndim == 1

    def test_enhance_audio_auto_mode(self):
        _require_deepfilternet()
        from backend.services.audio_enhancer import EnhanceMode, enhance_audio

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32) * 0.5
        enhanced, _sr = enhance_audio(audio, 16000, mode=EnhanceMode.AUTO)
        assert isinstance(enhanced, np.ndarray)
        assert len(enhanced) > 0

    def test_enhance_audio_empty(self):
        _require_deepfilternet()
        from backend.services.audio_enhancer import EnhanceMode, enhance_audio

        audio = np.array([], dtype=np.float32)
        enhanced, _sr = enhance_audio(audio, 16000, mode=EnhanceMode.DENOISE)
        assert isinstance(enhanced, np.ndarray)

    def test_enhance_audio_lavasr_mode(self):
        from backend.services.audio_enhancer import enhance_audio, is_lavasr_available

        if not is_lavasr_available():
            pytest.skip("audiosronnx not installed")

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32) * 0.5
        enhanced, sr = enhance_audio(audio, 16000, mode="lavasr")
        assert isinstance(enhanced, np.ndarray)
        # LavaSR upscales to 48 kHz
        assert sr == 48000


class TestAudioEnhanceRoute:
    """Test the /audio/enhance endpoint."""

    def test_enhance_missing_file(self, client):
        response = client.post(
            "/audio/enhance",
            json={"audio_path": "nonexistent.wav", "mode": "auto"},
        )
        assert response.status_code == 404

    def test_enhance_invalid_mode(self, client, tmp_path):
        _require_soundfile()
        import soundfile as sf

        from backend.config import to_storage_path

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32)
        audio_file = tmp_path / "test.wav"
        sf.write(str(audio_file), audio, 16000)

        storage_path = to_storage_path(audio_file)

        response = client.post(
            "/audio/enhance",
            json={"audio_path": storage_path, "mode": "invalid"},
        )
        assert response.status_code == 400
        body = response.json()["detail"]
        assert "mode" in body.lower() or "mode" in str(body)
        # detail is a string, not a dict

    def test_enhance_denoise_mode(self, client, tmp_path):
        _require_deepfilternet()
        _require_soundfile()
        import soundfile as sf

        from backend.config import to_storage_path

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 16000)).astype(np.float32) * 0.5
        audio_file = tmp_path / "test.wav"
        sf.write(str(audio_file), audio, 16000)

        storage_path = to_storage_path(audio_file)

        response = client.post(
            "/audio/enhance",
            json={"audio_path": storage_path, "mode": "denoise"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
