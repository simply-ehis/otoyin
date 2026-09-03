"""Unit tests for the ACE-Step 1.5 music backend.

Covers prompt folding (genre/mood/tempo), the transformers custom-code
pipeline lifecycle, cache gating, registry/config/catalog wiring, the
license gate (catalog id == model_name), the /generate/music route, and
the MCP tool. No real model or torch is required - everything is
monkeypatched.
"""

import importlib
from unittest.mock import MagicMock

import numpy as np
import pytest

from backend.backends import acestep_backend as ace, configs as configs_mod
from backend.backends.protocols import MUSIC_ENGINES
from backend.services import marketplace_catalog

# ---------------------------------------------------------------- engine wiring


def test_engine_registered():
    assert "acestep" in MUSIC_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("acestep-1-5")
    assert cfg is not None
    assert cfg.engine == "acestep"
    assert cfg.hf_repo_id == "ACE-Step/Ace-Step1.5"
    assert cfg.quant == "bf16"
    assert cfg.size_mb > 10000


def test_catalog_id_matches_model_name():
    # The license gate in routes/models/download.py resolves entitlements by
    # model_name == catalog id - a mismatch would make the model undownloadable.
    product = marketplace_catalog.get_product("acestep-1-5")
    assert product is not None
    assert product["paid"] is True
    assert product["category"] == "music"


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_music_backend

    backend = get_music_backend("acestep")
    assert backend is ace.acestep_backend


def test_backend_factory_unknown_engine():
    from backend.backends.registry import get_music_backend

    with pytest.raises(ValueError, match="music engine"):
        get_music_backend("nope")


# ---------------------------------------------------------------- availability


def test_is_available(monkeypatch):
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: MagicMock())
    assert ace.acestep_backend.is_available() is True


def test_is_available_missing_packages(monkeypatch):
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)
    assert ace.acestep_backend.is_available() is False


# ---------------------------------------------------------------- load_model


def test_load_model_not_cached_raises(monkeypatch):
    monkeypatch.setattr(ace, "is_model_cached", lambda repo: False)
    with pytest.raises(ace.ModelNotCachedError, match="not downloaded"):
        ace.acestep_backend.load_model()


def test_load_model_builds_pipeline(monkeypatch):
    monkeypatch.setattr(ace, "is_model_cached", lambda repo: True)
    fake_pipeline = MagicMock()
    monkeypatch.setattr("transformers.pipeline", lambda *a, **kw: fake_pipeline)
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)

    ace.acestep_backend.unload_model()
    ace.acestep_backend.load_model()

    assert ace.acestep_backend.model is fake_pipeline
    assert ace.acestep_backend.device == "cpu"


def test_load_model_idempotent(monkeypatch):
    monkeypatch.setattr(ace, "is_model_cached", lambda repo: True)
    fake_pipeline = MagicMock()
    calls = []

    def fake_pipeline_factory(*a, **kw):
        calls.append(kw)
        return fake_pipeline

    monkeypatch.setattr("transformers.pipeline", fake_pipeline_factory)
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)

    ace.acestep_backend.unload_model()
    ace.acestep_backend.load_model()
    ace.acestep_backend.load_model()

    assert len(calls) == 1
    assert calls[0]["trust_remote_code"] is True


# ---------------------------------------------------------------- generate


def test_generate_folds_genre_mood_tempo(monkeypatch):
    fake_pipeline = MagicMock()
    fake_pipeline.return_value = {
        "audio": np.zeros((2, 48000), dtype=np.float32),
        "sampling_rate": 48000,
    }
    monkeypatch.setattr(ace, "is_model_cached", lambda repo: True)
    monkeypatch.setattr("transformers.pipeline", lambda *a, **kw: fake_pipeline)
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)

    ace.acestep_backend.unload_model()
    audio, sr = ace.acestep_backend.generate(
        prompt="warm guitar arpeggio",
        duration_seconds=45.0,
        genre="ambient",
        mood="calm",
        tempo=90,
        seed=7,
    )

    called_prompt = fake_pipeline.call_args.args[0]
    assert called_prompt == "ambient, calm, warm guitar arpeggio 90 bpm"
    assert fake_pipeline.call_args.kwargs["max_duration_seconds"] == 45.0
    assert fake_pipeline.call_args.kwargs["seed"] == 7
    assert audio.ndim == 1
    assert sr == 48000


def test_generate_omits_tempo_and_seed_when_unset(monkeypatch):
    fake_pipeline = MagicMock()
    fake_pipeline.return_value = {
        "audio": np.zeros(48000, dtype=np.float32),
        "sampling_rate": 48000,
    }
    monkeypatch.setattr(ace, "is_model_cached", lambda repo: True)
    monkeypatch.setattr("transformers.pipeline", lambda *a, **kw: fake_pipeline)
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)

    ace.acestep_backend.unload_model()
    ace.acestep_backend.generate(prompt="piano")

    called_prompt = fake_pipeline.call_args.args[0]
    assert called_prompt == "pop, neutral, piano"
    assert "bpm" not in called_prompt
    assert "seed" not in fake_pipeline.call_args.kwargs


def test_generate_defaults_sample_rate(monkeypatch):
    class FakeResult:
        audio = np.zeros((2, 48000), dtype=np.float32)

    fake_pipeline = MagicMock()
    fake_pipeline.return_value = FakeResult()
    monkeypatch.setattr(ace, "is_model_cached", lambda repo: True)
    monkeypatch.setattr("transformers.pipeline", lambda *a, **kw: fake_pipeline)
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)

    ace.acestep_backend.unload_model()
    audio, sr = ace.acestep_backend.generate(prompt="piano")

    assert audio.ndim == 1
    assert sr == ace.ACESTEP_SAMPLE_RATE


# ---------------------------------------------------------------- lifecycle


def test_is_loaded_and_unload():
    ace.acestep_backend.model = MagicMock()
    assert ace.acestep_backend.is_loaded() is True
    ace.acestep_backend.unload_model()
    assert ace.acestep_backend.is_loaded() is False


# ---------------------------------------------------------------- REST route


@pytest.fixture
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend.routes.generate import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _fake_music_backend(monkeypatch, **attrs):
    """Patch the route's engine dispatch to return a controllable fake."""

    class FakeBackend:
        def __init__(self):
            self.is_available = lambda: attrs.get("available", True)
            self.generate = attrs.get("generate", lambda **kw: (np.zeros(48000, dtype=np.float32), 48000))

    fake = FakeBackend()
    monkeypatch.setattr("backend.routes.generate.get_music_backend", lambda engine: fake)
    return fake


def test_generate_music_route_ok(client, monkeypatch):
    _fake_music_backend(monkeypatch)

    resp = client.post(
        "/generate/music",
        json={
            "engine": "acestep",
            "prompt": "calm piano",
            "duration_seconds": 30,
            "genre": "ambient",
            "mood": "calm",
            "tempo": 90,
        },
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content[:4] == b"RIFF"


def test_generate_music_route_unavailable(client, monkeypatch):
    _fake_music_backend(monkeypatch, available=False)

    resp = client.post("/generate/music", json={"engine": "acestep", "prompt": "piano"})
    assert resp.status_code == 503


def test_generate_music_route_not_cached(client, monkeypatch):
    from backend.backends.base import ModelNotCachedError

    def _raise(**kw):
        raise ModelNotCachedError("model 'x' is not downloaded")

    _fake_music_backend(monkeypatch, generate=_raise)

    resp = client.post("/generate/music", json={"prompt": "piano"})
    assert resp.status_code == 400
    assert "not downloaded" in resp.json()["detail"]


def test_generate_music_route_unknown_engine(client):
    resp = client.post("/generate/music", json={"prompt": "piano", "engine": "nope"})
    assert resp.status_code == 400
    assert "music engine" in resp.json()["detail"]


def test_generate_music_route_bounds(client, monkeypatch):
    _fake_music_backend(monkeypatch)

    resp = client.post("/generate/music", json={"prompt": "piano", "duration_seconds": 500})
    assert resp.status_code == 422

    resp = client.post("/generate/music", json={"prompt": "piano", "duration_seconds": 0.5})
    assert resp.status_code == 422


# ---------------------------------------------------------------- MCP tool


def test_mcp_generate_music(monkeypatch):
    from backend.mcp_server.tools import generation as gen_mod

    fake_backend = MagicMock()
    fake_backend.is_available.return_value = True
    fake_backend.generate.return_value = (np.zeros(48000, dtype=np.float32), 48000)
    # The tool imports get_music_backend from backend.backends inside the
    # function body - patch the source module.
    import backend.backends as b_mod

    engines = []
    monkeypatch.setattr(b_mod, "get_music_backend", lambda engine: engines.append(engine) or fake_backend)
    monkeypatch.setattr(gen_mod, "_wav_b64", lambda a, sr: f"wav-{len(a)}-{sr}")

    captured = {}

    class FakeMCP:
        def tool(self, name=None, description=None):
            def deco(fn):
                captured[name] = fn
                return fn

            return deco

    gen_mod.register_generation_tools(FakeMCP())
    assert "21labs.generate_music" in captured
    import asyncio

    result = asyncio.run(captured["21labs.generate_music"](prompt="piano", genre="jazz", tempo=120))
    assert result["engine"] == "acestep"
    assert result["sample_rate"] == 48000
    assert result["duration"] == 1.0
    assert engines == ["acestep"]
    assert fake_backend.generate.call_args.kwargs["tempo"] == 120
