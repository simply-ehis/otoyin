"""E2E tests: verify Parakeet and Qwen3-ASR STT backends register and load.

Uses the FastAPI TestClient (no real server process) to hit the /models/status
endpoint and the backend registry lifecycle, verifying the full integration
path: config registration → /models/status response → backend load/unload.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


# ---------------------------------------------------------------------------
# /models/status endpoint — verify new STT models appear
# ---------------------------------------------------------------------------


class TestModelsStatusEndpoint:
    """Hit /models/status and verify Parakeet + Qwen3-ASR are listed."""

    @pytest.fixture
    def client(self):
        """Create a FastAPI test client with readiness bypassed."""
        from starlette.testclient import TestClient

        from backend.app import _init_ready_event, _signal_ready, create_app

        # Initialize the readiness event and signal ready immediately
        # so the middleware doesn't block requests during tests.
        _init_ready_event()
        _signal_ready()

        app = create_app()
        client = TestClient(app, raise_server_exceptions=False)
        return client

    def test_parakeet_models_appear_in_status(self, client):
        """GET /models/status should list Parakeet TDT models."""
        response = client.get("/models/status")
        assert response.status_code == 200
        data = response.json()
        models = data.get("models", [])

        parakeet_models = [m for m in models if m.get("engine") == "parakeet"]
        assert len(parakeet_models) >= 2, f"Expected >=2 Parakeet models in /models/status, got {len(parakeet_models)}"

        # Verify expected model sizes
        {m.get("display_name", "").lower() for m in parakeet_models}
        model_names = {m.get("model_name", "") for m in parakeet_models}
        assert any("parakeet" in name.lower() for name in model_names), (
            f"Expected 'parakeet' in model names, got {model_names}"
        )

        # Verify required fields present
        for m in parakeet_models:
            assert "engine" in m
            assert "display_name" in m
            assert "model_name" in m
            assert "downloaded" in m
            assert "loaded" in m

    def test_qwen3_models_appear_in_status(self, client):
        """GET /models/status should list Qwen3-ASR models."""
        response = client.get("/models/status")
        assert response.status_code == 200
        data = response.json()
        models = data.get("models", [])

        qwen_models = [m for m in models if m.get("engine") == "qwen3_asr"]
        assert len(qwen_models) >= 2, f"Expected >=2 Qwen3-ASR models in /models/status, got {len(qwen_models)}"

        model_names = {m.get("model_name", "") for m in qwen_models}
        assert any("qwen" in name.lower() for name in model_names), f"Expected 'qwen' in model names, got {model_names}"

    def test_whisper_models_still_present(self, client):
        """Whisper models should still appear after Parakeet/Qwen3 were added."""
        response = client.get("/models/status")
        assert response.status_code == 200
        models = response.json().get("models", [])

        whisper_models = [m for m in models if m.get("engine") == "whisper"]
        assert len(whisper_models) >= 3, f"Expected >=3 Whisper models (tiny/base/large), got {len(whisper_models)}"

    def test_small_en_and_medium_en_removed(self, client):
        """Whisper small.en and medium.en should NOT appear (replaced by Parakeet/Qwen3)."""
        response = client.get("/models/status")
        assert response.status_code == 200
        models = response.json().get("models", [])

        whisper_models = [m for m in models if m.get("engine") == "whisper"]
        sizes = {m.get("model_size", "") for m in whisper_models}
        assert "small.en" not in sizes, "Whisper small.en should be replaced by Parakeet"
        assert "medium.en" not in sizes, "Whisper medium.en should be replaced by Qwen3-ASR"

    def test_total_model_count_increased(self, client):
        """Total model count should have increased by 4 (2 Parakeet + 2 Qwen3)."""
        response = client.get("/models/status")
        assert response.status_code == 200
        total = len(response.json().get("models", []))

        # Pre-addition: ~30-40 models. Post-addition: should have 4 more.
        # Use a generous lower bound to avoid flakiness.
        assert total >= 20, f"Expected >=20 total models, got {total}"

    def test_stt_models_not_loaded_by_default(self, client):
        """New STT models should NOT be loaded at startup (lazy loading)."""
        response = client.get("/models/status")
        assert response.status_code == 200
        models = response.json().get("models", [])

        new_stt = [m for m in models if m.get("engine") in ("parakeet", "qwen3_asr")]
        for m in new_stt:
            assert m.get("loaded") is False, f"Model {m.get('model_name')} should not be loaded at startup"


# ---------------------------------------------------------------------------
# Backend registry lifecycle — load → is_loaded → unload
# ---------------------------------------------------------------------------


class TestSTTBackendLifecycle:
    """Verify load/is_loaded/unload cycle through the registry."""

    def test_parakeet_load_and_unload(self):
        """Parakeet backend: instantiate → load (mock) → verify → unload."""
        from backend.backends.registry import get_stt_backend

        backend = get_stt_backend("parakeet")
        assert not backend.is_loaded()

        # Mock the binary discovery and model check to simulate a successful load
        with (
            patch.object(backend, "_is_model_cached", return_value=True),
            patch.object(backend, "_find_binary", return_value=Path("/mock/parakeet")),
        ):
            import asyncio

            asyncio.run(backend.load_model())
            assert backend.is_loaded()

        # Unload
        backend.unload_model()
        assert not backend.is_loaded()

    def test_qwen3_load_and_unload(self):
        """Qwen3-ASR backend: instantiate → load (mock) → verify → unload."""
        from backend.backends.registry import get_stt_backend

        backend = get_stt_backend("qwen3_asr")
        assert not backend.is_loaded()

        # Mock ONNX Runtime import and model check. The backend introspects
        # session I/O at load time (_map_decoder_io), so the fake must expose
        # get_inputs()/get_outputs() covering every graph it probes.
        def _node(name):
            return type("Node", (), {"name": name, "shape": []})()

        mock_session = type(
            "MockSession",
            (),
            {
                "run": lambda self, *a, **kw: None,
                "get_inputs": lambda self: [
                    _node("input_features"),
                    _node("input_ids"),
                    _node("encoder_hidden_states"),
                    _node("input_embeds"),
                ],
                "get_outputs": lambda self: [_node("hidden"), _node("logits")],
            },
        )()

        with (
            patch.object(backend, "_is_model_cached", return_value=True),
            patch("backend.backends.qwen3_asr_backend.config") as mock_config,
            patch.dict(
                "sys.modules",
                {
                    "onnxruntime": type(sys)("onnxruntime"),
                },
            ),
        ):
            mock_config.get_models_dir.return_value = Path("/mock/models")
            # The load requires onnxruntime — mock it
            import types

            ort_mock = types.ModuleType("onnxruntime")
            ort_mock.SessionOptions = type(
                "SessionOptions",
                (),
                {
                    "graph_optimization_level": None,
                    "ORT_ENABLE_ALL": None,
                },
            )
            ort_mock.GraphOptimizationLevel = type("GOL", (), {"ORT_ENABLE_ALL": 1})
            ort_mock.InferenceSession = lambda *a, **kw: mock_session

            with patch.dict("sys.modules", {"onnxruntime": ort_mock}):
                import asyncio

                asyncio.run(backend.load_model())
                assert backend.is_loaded()

        # Unload
        backend.unload_model()
        assert not backend.is_loaded()

    def test_registry_returns_same_instance(self):
        """get_stt_backend returns the same singleton for the same engine."""
        from backend.backends.registry import get_stt_backend

        b1 = get_stt_backend("parakeet")
        b2 = get_stt_backend("parakeet")
        assert b1 is b2

        b3 = get_stt_backend("qwen3_asr")
        b4 = get_stt_backend("qwen3_asr")
        assert b3 is b4

    def test_all_stt_backends_have_transcribe_interface(self):
        """All STT backends must expose transcribe + transcribe_with_segments."""
        from backend.backends.registry import get_stt_backend

        for engine in ("whisper", "parakeet", "qwen3_asr"):
            backend = get_stt_backend(engine)
            assert hasattr(backend, "transcribe"), f"{engine} missing transcribe"
            assert hasattr(backend, "transcribe_with_segments"), f"{engine} missing transcribe_with_segments"
            assert hasattr(backend, "load_model"), f"{engine} missing load_model"
            assert hasattr(backend, "unload_model"), f"{engine} missing unload_model"
            assert hasattr(backend, "is_loaded"), f"{engine} missing is_loaded"


# ---------------------------------------------------------------------------
# Config registration — verify models are in the unified config
# ---------------------------------------------------------------------------


class TestSTTConfigRegistration:
    """Verify Parakeet and Qwen3-ASR models are in get_all_model_configs()."""

    def test_parakeet_in_all_configs(self):
        from backend.backends.configs import get_all_model_configs

        configs = get_all_model_configs()
        parakeet = [c for c in configs if c.engine == "parakeet"]
        assert len(parakeet) >= 2
        assert all(c.category == "stt" for c in parakeet)

    def test_qwen3_in_all_configs(self):
        from backend.backends.configs import get_all_model_configs

        configs = get_all_model_configs()
        qwen = [c for c in configs if c.engine == "qwen3_asr"]
        assert len(qwen) >= 2
        assert all(c.category == "stt" for c in qwen)

    def test_quality_scores_set(self):
        """Each new model should have a quality_score from the research."""
        from backend.backends.configs import get_all_model_configs

        configs = get_all_model_configs()
        new_models = [c for c in configs if c.engine in ("parakeet", "qwen3_asr")]
        for c in new_models:
            assert c.quality_score is not None and c.quality_score > 0, f"{c.model_name} missing quality_score"

    def test_hf_repo_ids_populated(self):
        """Each new model should have a valid HF repo ID for downloading."""
        from backend.backends.configs import get_all_model_configs

        configs = get_all_model_configs()
        new_models = [c for c in configs if c.engine in ("parakeet", "qwen3_asr")]
        for c in new_models:
            assert c.hf_repo_id, f"{c.model_name} missing hf_repo_id"
            assert "/" in c.hf_repo_id, f"{c.model_name} has invalid hf_repo_id: {c.hf_repo_id}"
