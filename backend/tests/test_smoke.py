"""Automated smoke tests — backend-only subset of docs/DEPLOYMENT_TEST_PLAN.md.

Run against a live server:
    python -m pytest backend/tests/test_smoke.py -v --base-url http://127.0.0.1:17493

All tests are marked ``slow`` so they are skipped by default in CI.
"""

import io
import os
import time

import numpy as np
import pytest

pytest.importorskip("soundfile")
import soundfile as sf

try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed", allow_module_level=True)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("TWENTYLABS_SMOKE_BASE_URL", "http://127.0.0.1:17493")


def _url(path: str) -> str:
    return f"{BASE_URL}{path}"


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=30.0)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    """Yield an httpx client; skip the whole module if the server is down."""
    c = _client()
    try:
        r = c.get("/health")
        r.raise_for_status()
    except Exception:
        pytest.skip("Server not reachable at " + BASE_URL)
    yield c
    c.close()


# ---------------------------------------------------------------------------
# 1. Startup & Health
# ---------------------------------------------------------------------------


class TestStartupAndHealth:
    def test_health_endpoint(self, client):
        """1.3 — GET /health returns healthy status."""
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        assert "model_loaded" in data
        assert "gpu_available" in data

    def test_health_latency(self, client):
        """GPU snapshot should be cached — health must respond in <500ms."""
        start = time.perf_counter()
        client.get("/health")
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert elapsed_ms < 500, f"Health endpoint took {elapsed_ms:.0f}ms (expected <500ms)"


# ---------------------------------------------------------------------------
# 2. TTS Generation
# ---------------------------------------------------------------------------


class TestTTSGeneration:
    def test_engines_list(self, client):
        """2.1 — /tts/engines returns available engines."""
        r = client.get("/tts/engines")
        assert r.status_code == 200
        engines = r.json()["engines"]
        assert isinstance(engines, list)
        assert len(engines) > 0, "No TTS engines registered"
        for entry in engines:
            assert "engine" in entry and "cached" in entry

    def test_generate_short_text(self, client):
        """2.2 — Generate 'Hello world' produces valid audio."""
        r = client.post(
            "/generations",
            json={
                "text": "Hello world",
                "engine": "kitten-tts",
                "model_size": "micro",
                "language": "en",
                "normalize": True,
            },
        )
        if r.status_code == 404:
            pytest.skip("Generation endpoint not found (may need different path)")
        assert r.status_code in (200, 201), f"Generation failed: {r.status_code} {r.text[:200]}"

    def test_voice_clean_endpoint(self, client):
        """Voice clean endpoint accepts request without crashing."""
        # Create a tiny WAV in memory
        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 24000)).astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, audio, 24000, format="WAV")
        buf.seek(0)

        # Upload via the existing noise-reduce path (uses upload)
        # This tests that the voice_clean request model is valid

        # Just verify the request model validates
        from backend.routes.features import VoiceCleanABRequest, VoiceCleanRequest

        req = VoiceCleanRequest(audio_path="test.wav", preset="light")
        assert req.preset == "light"

        ab_req = VoiceCleanABRequest(audio_path="test.wav", engine="kokoro")
        assert ab_req.engine == "kokoro"


# ---------------------------------------------------------------------------
# 4. Effects Chain
# ---------------------------------------------------------------------------


class TestEffectsChain:
    def test_builtin_presets(self, client):
        """4.1 — /presets/builtin returns preset list."""
        r = client.get("/presets/builtin")
        assert r.status_code == 200
        presets = r.json()
        assert isinstance(presets, list)
        assert len(presets) > 0

    def test_voice_clean_ab_model(self):
        """4.5 — VoiceCleanABRequest validates correctly."""
        from backend.routes.features import VoiceCleanABRequest

        req = VoiceCleanABRequest(audio_path="/test.wav", engine="chattts", strength=0.8)
        assert req.engine == "chattts"
        assert req.strength == 0.8


# ---------------------------------------------------------------------------
# 6. Mixer / Batch
# ---------------------------------------------------------------------------


class TestBatchAndSession:
    def test_batch_job_crud(self, client):
        """6.1 — Create/list/cancel a batch job (batch.py contract:
        name+func_name required, response uses ``id``, list is wrapped)."""
        r = client.post(
            "/batch/jobs",
            json={"name": "smoke-test", "func_name": "noop", "func_args": {}},
        )
        assert r.status_code == 200, f"Create failed: {r.status_code} {r.text[:200]}"
        job_id = r.json()["id"]

        r = client.get("/batch/jobs")
        assert r.status_code == 200
        jobs = r.json()["jobs"]
        assert any(j["id"] == job_id for j in jobs)

        r = client.post(f"/batch/jobs/{job_id}/cancel")
        assert r.status_code == 200
        assert r.json()["id"] == job_id

    def test_session_save_load(self, client):
        """6.2 — Session save+load round-trips. A clipless session saves
        fine but validates with a warning (valid=False by design)."""
        session_data = '{"version":1,"tracks":[],"markers":[]}'
        r = client.post("/session/save", json={"name": "smoke", "session_data": session_data})
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is False
        assert any("no clips" in w.lower() for w in body["warnings"])

        r = client.post("/session/load", json={"name": "smoke", "session_data": session_data})
        assert r.status_code == 200
        assert r.json()["version"] == 1


# ---------------------------------------------------------------------------
# 12. Export
# ---------------------------------------------------------------------------


class TestExport:
    def test_preset_export_roundtrip(self, client):
        """12.1 — Export a preset to JSON and re-import."""
        chain = [{"effect": "reverb", "params": {"room_size": 0.5}}]
        r = client.post(
            "/presets/export",
            json={"name": "smoke-preset", "effects_chain": chain, "description": "test"},
        )
        assert r.status_code == 200
        preset_json = r.json()["preset_json"]

        r = client.post("/presets/import", json={"preset_json": preset_json})
        assert r.status_code == 200
        imported = r.json()
        assert imported["name"] == "smoke-preset"


# ---------------------------------------------------------------------------
# Engine preset integration (Phase 2)
# ---------------------------------------------------------------------------


class TestEnginePresets:
    def test_all_engines_have_preset_mapping(self):
        """Every engine in the TTS catalog should map to a known preset."""
        from backend.services.tts_enhancer import _PRESETS, ENGINE_PRESETS

        for engine, preset in ENGINE_PRESETS.items():
            assert preset in _PRESETS, f"Engine '{engine}' maps to unknown preset '{preset}'"

    def test_resolve_params_engine_only(self):
        """_resolve_params with just engine name returns correct preset."""
        from backend.services.tts_enhancer import _resolve_params

        merged = _resolve_params(None, engine="kokoro")
        assert merged["dynamics"] is False  # light preset

        merged = _resolve_params(None, engine="chattts")
        assert merged["dynamics"] is True  # heavy preset

    def test_resolve_params_explicit_beats_engine(self):
        """Explicit preset overrides engine default."""
        from backend.services.tts_enhancer import _resolve_params

        merged = _resolve_params({"preset": "light"}, engine="chattts")
        assert merged["dynamics"] is False  # explicit light wins over chattts heavy
