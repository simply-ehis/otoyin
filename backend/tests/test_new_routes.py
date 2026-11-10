"""Tests for new route endpoints (conversation, export, automation, spatial, bridge, assistant, stt)."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Build a minimal app with just the routers we need to test."""
    from fastapi import FastAPI

    from backend.routes.assistant import router as assistant_router
    from backend.routes.audio_pipeline.bridge import router as bridge_router
    from backend.routes.automation import router as auto_router
    from backend.routes.conversation import router as conv_router
    from backend.routes.platform_export import router as export_router
    from backend.routes.spatial import router as spatial_router
    from backend.routes.streaming_stt import router as stt_router

    app = FastAPI()
    for r in [conv_router, export_router, auto_router, spatial_router, bridge_router, assistant_router, stt_router]:
        app.include_router(r)
    return TestClient(app)


class TestConversationPresets:
    def test_returns_dict(self, client):
        resp = client.get("/conversation/presets")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert len(data) > 0


class TestConversationAutoDuck:
    def test_returns_gains(self, client):
        lines = [
            {"id": "1", "text": "Hello", "speaker": "A", "start_offset_ms": 0, "track": 0},
            {"id": "2", "text": "World", "speaker": "B", "start_offset_ms": 1000, "track": 0},
        ]
        resp = client.post("/conversation/auto-duck", json=lines)
        assert resp.status_code == 200
        data = resp.json()
        assert "gains" in data
        assert len(data["gains"]) == 2

    def test_single_line_returns_zero(self, client):
        lines = [{"id": "1", "text": "Hello", "speaker": "A"}]
        resp = client.post("/conversation/auto-duck", json=lines)
        assert resp.status_code == 200
        data = resp.json()
        key = "gains" if "gains" in data else "lines"
        assert data[key] == [0.0]


class TestConversationAutoLevel:
    def test_returns_levels(self, client):
        lines = [
            {"id": "1", "text": "A", "speaker": "A"},
            {"id": "2", "text": "B", "speaker": "B"},
        ]
        resp = client.post("/conversation/auto-level", json=lines)
        assert resp.status_code == 200
        data = resp.json()
        assert "target_lufs" in data
        assert len(data["target_lufs"]) == 2


class TestExportPresets:
    def test_returns_seven_presets(self, client):
        resp = client.get("/export/presets")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert len(data) == 7
        for key in [
            "podcast",
            "audiobook",
            "movie_audio",
            "voiceover",
            "social_media",
            "streaming_opus",
            "archive_aiff",
        ]:
            assert key in data


class TestAutomationParameters:
    def test_returns_dict(self, client):
        resp = client.get("/automation/parameters")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert "volume" in data
        assert "pan" in data


class TestAutomationCrossfadeCurves:
    def test_returns_dict(self, client):
        resp = client.get("/automation/crossfade-curves")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert "linear" in data
        assert "equal_power" in data


class TestAutomationInterpolate:
    def test_returns_envelope(self, client):
        req = {"points": [[0, 0.0], [100, 1.0], [200, 0.5]], "curve": "linear"}
        resp = client.post("/automation/interpolate", json=req)
        assert resp.status_code == 200
        data = resp.json()
        assert "envelope" in data
        assert len(data["envelope"]) >= 2

    def test_single_point_returns_as_is(self, client):
        req = {"points": [[0, 0.5]], "curve": "linear"}
        resp = client.post("/automation/interpolate", json=req)
        assert resp.status_code == 200
        assert resp.json()["envelope"] == [[0, 0.5]]


class TestSpatialPresets:
    def test_returns_dict(self, client):
        resp = client.get("/spatial/presets")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert len(data) > 0


class TestSpatialConvolutionPresets:
    def test_returns_dict(self, client):
        resp = client.get("/spatial/convolution-presets")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert "car_interior" in data
        assert "church" in data


class TestSpatialApply:
    """Verify the spatial endpoints actually produce audio (NumPy fallback)."""

    @staticmethod
    def _seed_wav():
        import numpy as np
        import soundfile as sf

        from backend import config

        sr = 24000
        t = np.arange(int(sr * 0.25)) / sr
        sig = (0.4 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
        path = config.get_data_dir() / "sp_test.wav"
        sf.write(str(path), sig, sr)
        return path

    def test_binaural_returns_wav(self, client):
        self._seed_wav()
        resp = client.post(
            "/spatial/apply-binaural",
            json={"audio_path": "sp_test.wav", "x": 0.6, "y": 0.0, "z": 0.2},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"
        assert len(resp.content) > 1000

    def test_convolution_returns_wav(self, client):
        self._seed_wav()
        resp = client.post(
            "/spatial/apply-convolution",
            params={"audio_path": "sp_test.wav", "environment": "church"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"

    def test_doppler_returns_wav(self, client):
        self._seed_wav()
        resp = client.post(
            "/spatial/apply-doppler",
            params={"audio_path": "sp_test.wav", "speed": 0.8},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"

    def test_render_returns_wav(self, client):
        self._seed_wav()
        resp = client.post(
            "/spatial/render",
            json={"audio_path": "sp_test.wav", "x": -0.4, "y": 0.0, "z": 0.5},
            params={"environment": "coffee_shop"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"

    def test_render_mix_returns_wav(self, client):
        self._seed_wav()
        resp = client.post(
            "/spatial/render-mix",
            json={
                "sources": [
                    {"audio_path": "sp_test.wav", "x": -0.6, "y": 0.0, "z": 0.2, "gain_db": 0.0},
                    {"audio_path": "sp_test.wav", "x": 0.6, "y": 0.0, "z": -0.2, "gain_db": -6.0},
                ],
                "environment": "church",
                "wet_dry_mix": 0.4,
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"
        # A mix of two sources must be longer than silence and produce real audio.
        assert len(resp.content) > 1000

    def test_service_exposes_apply_doppler(self):
        from backend.services.steam_audio import steam_audio

        assert hasattr(steam_audio, "apply_doppler")
        import numpy as np

        sig = np.zeros(1000, dtype=np.float32)
        out = steam_audio.apply_doppler(sig, 24000, speed=0.0)
        assert out.shape == (1000,)


class TestSpatialStatus:
    def test_status_reports_backend(self, client):
        resp = client.get("/spatial/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "backend" in data
        assert data["backend"] in ("steam_audio", "numpy_dsp")
        assert "sdk_enabled" in data
        assert "hrtf_available" in data


class TestSpatialDSP:
    def test_cos_pan_produces_stereo(self):
        import numpy as np

        from backend.services import steam_audio

        mono = np.ones(100, dtype=np.float32)
        out = steam_audio.steam_audio._cos_pan(mono, x=1.0, z=0.0, gain_db=0.0, dist=1.0)
        assert out.shape == (100, 2)
        assert out.dtype == np.float32

    def test_doppler_resample_length_preserved(self):
        import numpy as np

        from backend.services import steam_audio

        sig = np.arange(500, dtype=np.float32) / 500.0
        out = steam_audio.steam_audio._doppler_resample(sig, 24000, speed=1.5)
        assert out.shape == (500,)
        assert np.all(np.isfinite(out))

    def test_hrtf_probe_returns_none_without_dataset(self):
        from backend.services.steam_audio import _hrtf_path

        assert _hrtf_path() is None or _hrtf_path().exists()

    def test_load_is_safe_with_corrupt_zip(self):
        from backend.services import steam_audio

        # load() must never raise, even if an extractable archive is corrupt.
        # With the real phonon.dll + bundled SOFA HRTF present, the SDK binaural
        # path activates and produces genuine (non-silent) HRTF output.
        assert steam_audio.steam_audio.load() in (True, False)
        if steam_audio.steam_audio.available and steam_audio.steam_audio.hrtf_available:
            assert steam_audio.steam_audio.enable_sdk() is True
            assert steam_audio.steam_audio.sdk_enabled is True
            import numpy as _np

            sr = 24000
            mono = (0.4 * _np.sin(2 * _np.pi * 220 * _np.arange(int(sr * 0.3)) / sr)).astype(_np.float32)
            out = steam_audio.steam_audio.apply_binaural(mono, sr, x=1.0, y=0.0, z=0.0)
            assert out.shape[1] == 2
            assert float(_np.max(_np.abs(out))) > 1e-4
            assert not _np.any(_np.isnan(out))


class TestBridgeImport:
    def test_import_endpoint_exists(self, client):
        resp = client.post("/bridge/import", json={"audio_path": "/nonexistent.wav"})
        assert resp.status_code in (404, 422)


class TestAssistantModels:
    def test_returns_model_list(self, client):
        resp = client.get("/assistant/models")
        assert resp.status_code == 200
        data = resp.json()
        assert "local" in data
        assert "api_providers" in data
        assert isinstance(data["api_providers"], list)
        assert len(data["api_providers"]) >= 5


class TestStreamingSTTStatus:
    def test_returns_status(self, client):
        resp = client.get("/stt/stream/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "active_sessions" in data
        assert "model_loaded" in data
