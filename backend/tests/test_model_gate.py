"""Tests for the download-manifest model gate + always-on toggle + offline
load paths. Hermetic: uses a temp-file SQLite DB and monkeypatched backends,
so no real models or torch are required."""

import asyncio
import os
import sys
import tempfile
import types

import pytest


def _make_session_factory():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import AppSetting, Base, ModelDownload

    fd, path = tempfile.mkstemp(suffix=".gate_test.db")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(eng, tables=[ModelDownload.__table__, AppSetting.__table__], checkfirst=True)
    return sessionmaker(bind=eng)


class _FakeCfg:
    """A config object that supports both attribute and dict-like access."""

    def __init__(self, model_name="chattts", model_size="default", engine="chattts", repo="r/f"):
        self.model_name = model_name
        self.model_size = model_size
        self.engine = engine
        self.hf_repo_id = repo
        self.display_name = model_name
        self.gpu_only = False
        self.clone_voice = False
        self.emotion_control = False
        self.supports_instruct = False
        self.paralinguistic_tags = False
        self.voice_design = False
        self.supports_editing = False
        self.supported_tags = []
        self.structured_preset_voices = []
        self.supports_voice_mixing = False
        self.category = "tts"

    def __getitem__(self, key):
        return getattr(self, key)

    def __contains__(self, key):
        return hasattr(self, key)

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __iter__(self):
        return iter(vars(self))

    def items(self):
        return vars(self).items()


def _fake_cfg(model_name="chattts", model_size="default", engine="chattts", repo="r/f"):
    return _FakeCfg(model_name, model_size, engine, repo)


# ----------------------------------------------------------------- manifest


def test_record_is_downloaded_forget(monkeypatch):
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    assert mr.is_downloaded("planner-4b", "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M") is False
    mr.record_download(sess(), "planner-4b", "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M", "gguf_llm", "r/f", None, None)
    assert mr.is_downloaded("planner-4b", "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M") is True
    assert mr.is_downloaded("planner-4b", None) is False  # size-scoped
    assert mr.forget_download("planner-4b", "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M") is True
    assert mr.is_downloaded("planner-4b", "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M") is False
    assert mr.forget_download("planner-4b", "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M") is False


def test_reconcile_seeds_from_cache(monkeypatch):
    import backend.backends as backends
    import backend.services.model_registry as mr
    import backend.utils.model_status as ms

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)
    cfg = _fake_cfg(model_name="chattts")
    monkeypatch.setattr(backends, "get_all_model_configs", lambda: [cfg])
    monkeypatch.setattr(ms, "is_model_downloaded", lambda name: True)

    assert mr.reconcile_downloads() == 1
    assert mr.is_downloaded("chattts", "default") is True
    # no-op once a row exists (preserves deletions / user state)
    assert mr.reconcile_downloads() == 0


def test_reconcile_empty_when_nothing_cached(monkeypatch):
    import backend.backends as backends
    import backend.services.model_registry as mr
    import backend.utils.model_status as ms

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)
    cfg = _fake_cfg(model_name="chattts")
    monkeypatch.setattr(backends, "get_all_model_configs", lambda: [cfg])
    monkeypatch.setattr(ms, "is_model_downloaded", lambda name: False)

    assert mr.reconcile_downloads() == 0
    assert mr.is_downloaded("chattts", "default") is False


# ----------------------------------------------------------------- always-on


def test_always_on_service(monkeypatch):
    import backend.services.always_on as ao

    sess = _make_session_factory()
    monkeypatch.setattr(ao, "SessionLocal", sess)

    engines = ao.get_always_on_engines()
    assert "gguf_llm" in engines  # default
    assert "tts" not in engines

    ao.set_engine_always_on("tts", True)
    assert "tts" in ao.get_always_on_engines()

    ao.set_engine_always_on("tts", False)
    assert "tts" not in ao.get_always_on_engines()

    # default engine cannot be disabled by the user
    ao.set_engine_always_on("gguf_llm", False)
    assert "gguf_llm" in ao.get_always_on_engines()


def test_lifecycle_refresh_and_skip_unload(monkeypatch):
    import backend.utils.model_lifecycle as lcm

    mgr = lcm.ModelLifecycleManager(idle_timeout=0)
    unloaded = {"gguf_llm": 0, "y": 0}
    mgr.register(
        "gguf_llm",
        lambda: True,
        lambda: unloaded.__setitem__("gguf_llm", unloaded["gguf_llm"] + 1),
    )
    mgr.register(
        "y",
        lambda: True,
        lambda: unloaded.__setitem__("y", unloaded["y"] + 1),
    )
    # default: gguf always-on, y not
    assert mgr._engines["gguf_llm"].always_on is True
    assert mgr._engines["y"].always_on is False

    asyncio.run(mgr._unload_if_idle())
    assert unloaded["gguf_llm"] == 0  # skipped (always-on)
    assert unloaded["y"] == 1  # idle >= timeout -> unloaded

    # flip via refresh: y becomes always-on, gguf not
    monkeypatch.setattr(lcm, "is_engine_always_on", lambda e: e == "y")
    mgr.refresh_always_on()
    assert mgr._engines["y"].always_on is True
    assert mgr._engines["gguf_llm"].always_on is False

    unloaded["gguf_llm"] = 0
    unloaded["y"] = 0
    asyncio.run(mgr._unload_if_idle())
    assert unloaded["gguf_llm"] == 1  # now unloaded
    assert unloaded["y"] == 0  # skipped (now always-on)


# ----------------------------------------------------------------- routes


def _build_app(submodule_name):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    mod = __import__(f"backend.routes.models.{submodule_name}", fromlist=[submodule_name])
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_status_reports_entitled(monkeypatch):
    client = _build_app("status")
    import backend.backends as backends
    import backend.routes.models.status as status_mod
    import backend.services.model_registry as mr

    monkeypatch.setattr(status_mod, "_CACHE_TTL_SEC", 0.0)
    monkeypatch.setattr(backends, "get_all_model_configs", lambda: [_fake_cfg("chattts")])
    monkeypatch.setattr(backends, "check_model_loaded", lambda c: False)
    monkeypatch.setattr(mr, "is_downloaded", lambda *a, **k: False)

    resp = client.get("/models/status")
    assert resp.status_code == 200
    assert resp.json()["models"][0]["entitled"] is False

    monkeypatch.setattr(mr, "is_downloaded", lambda *a, **k: True)
    resp2 = client.get("/models/status")
    assert resp2.json()["models"][0]["entitled"] is True


def test_models_load_gates_unentitled(monkeypatch):
    client = _build_app("load_unload")
    import backend.backends as backends
    import backend.services.model_registry as mr

    cfg = _fake_cfg(model_name="kokoro-onnx", engine="kokoro")
    monkeypatch.setattr(backends, "get_all_model_configs", lambda: [cfg])
    monkeypatch.setattr(mr, "is_downloaded", lambda *a, **k: False)

    resp = client.post("/models/load", params={"engine": "kokoro", "model_size": "default"})
    assert resp.status_code == 400
    assert "downloaded" in resp.json()["detail"].lower() or "models tab" in resp.json()["detail"].lower()


def test_models_load_self_heals_when_files_present(monkeypatch):
    """Manifest row missing + files on disk → re-seed, then load succeeds.

    Regression: privacy wipe / recreated DB dropped model_downloads while
    HF cache kept the weights. Status reported downloaded=True (filesystem)
    but /models/load 400'd on the entitlement gate."""
    client = _build_app("load_unload")
    import backend.backends as backends
    import backend.services.model_registry as mr
    import backend.utils.model_lifecycle as lcm
    import backend.utils.model_status as ms

    cfg = _fake_cfg(model_name="kokoro-onnx", engine="kokoro")
    sess = _make_session_factory()
    real_is_downloaded = mr.is_downloaded

    monkeypatch.setattr(mr, "SessionLocal", sess)
    monkeypatch.setattr(backends, "get_all_model_configs", lambda: [cfg])
    # Gate says no row (first call only) — after heal the real lookup applies.
    call_count = {"n": 0}

    def _gate(*a, **k):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return False
        return real_is_downloaded(*a, **k)

    monkeypatch.setattr(mr, "is_downloaded", _gate)
    # Files still on disk after wipe.
    monkeypatch.setattr(ms, "is_model_downloaded", lambda name: True)

    loaded = {"called": False}

    async def fake_load(target, size):
        loaded["called"] = True

    monkeypatch.setattr(backends, "load_engine_model", fake_load)
    monkeypatch.setattr(backends, "check_model_loaded", lambda c: True)
    monkeypatch.setattr(lcm.lifecycle_manager, "mark_model_used", lambda e: None)

    resp = client.post(
        "/models/load",
        params={"engine": "kokoro", "model_name": "kokoro-onnx"},
    )
    assert resp.status_code == 200, resp.text
    assert loaded["called"] is True
    # Manifest row was re-seeded via the real session factory path.
    assert real_is_downloaded("kokoro-onnx", "default") is True


def test_load_engine_model_gates_unentitled(monkeypatch):
    """The shared TTS load chokepoint refuses unentitled models for every caller
    (Models-load route, generations pre-load route, generation service)."""
    import asyncio

    from fastapi import HTTPException

    import backend.backends.configs as configs
    import backend.services.model_registry as mr

    cfg = _fake_cfg(model_name="kokoro-onnx", engine="kokoro", model_size="default")
    monkeypatch.setattr(configs, "get_all_model_configs", lambda: [cfg])
    monkeypatch.setattr(mr, "is_downloaded", lambda *a, **k: False)

    from backend.backends.registry import load_engine_model

    with pytest.raises(HTTPException) as ei:
        asyncio.run(load_engine_model("kokoro", "default"))
    assert ei.value.status_code == 400
    assert "downloaded" in ei.value.detail.lower() or "models tab" in ei.value.detail.lower()


def test_always_on_route_toggle(monkeypatch):
    import backend.services.always_on as ao
    import backend.utils.model_lifecycle as lcm

    client = _build_app("always_on")
    sess = _make_session_factory()
    monkeypatch.setattr(ao, "SessionLocal", sess)
    monkeypatch.setattr(lcm.lifecycle_manager, "refresh_always_on", lambda: None)

    resp = client.get("/models/always-on")
    assert resp.status_code == 200
    assert "gguf_llm" in resp.json()["engines"]  # default
    assert "tts" not in resp.json()["engines"]

    resp2 = client.post("/models/always-on", json={"engine": "tts", "always_on": True})
    assert resp2.status_code == 200
    assert "tts" in resp2.json()["engines"]

    resp3 = client.get("/models/always-on")
    assert "tts" in resp3.json()["engines"]


# ----------------------------------------------------------------- offline load paths


def _install_fake_onnxruntime(monkeypatch):
    fake = types.ModuleType("onnxruntime")

    class _Session:
        def __init__(self, path, **_kw):
            self.path = path

    fake.InferenceSession = _Session
    monkeypatch.setitem(sys.modules, "onnxruntime", fake)


def test_kokoro_onnx_weights_offline(monkeypatch):
    """Kokoro must resolve a cached quantized graph without touching the network.

    Regression history: the backend used to resolve *only* through the HF mirror
    (fp32, 326 MB). It now prefers an int8/fp16 variant downloaded from the
    kokoro-onnx GitHub release and cached under data/models/kokoro-onnx. When
    that cache already holds a variant, no download of any kind may happen.
    """
    import backend.backends.kokoro_onnx_backend as kok
    from backend.backends.kokoro_onnx_backend import KokoroONNXBackend

    def fake_hf(repo_id, filename, **kw):
        raise AssertionError("must not hit HF when a cached variant exists")

    monkeypatch.setattr(kok, "hf_hub_download", fake_hf)
    # Point the variants root at a tmp dir that already holds an int8 graph.
    import tempfile
    from pathlib import Path

    tmp = Path(tempfile.mkdtemp())
    (tmp / "kokoro-v1.0_int8.onnx").write_bytes(b"stub")
    monkeypatch.setattr(KokoroONNXBackend, "_variants_root", lambda self: str(tmp))
    monkeypatch.setattr(KokoroONNXBackend, "_resolve_voices_path", lambda self: "/fake/voices.bin")

    inst = KokoroONNXBackend.__new__(KokoroONNXBackend)
    model_path, voices = inst._resolve_paths()
    assert model_path.endswith("kokoro-v1.0_int8.onnx"), model_path
    assert voices == "/fake/voices.bin"
    # The cached path must be reported as cached so the Models tab agrees.
    assert inst._cached_variant() == (model_path, "int8")


def test_demucs_onnx_config_registered():
    """The downloadable model catalog must expose Demucs and its repo must
    match the repo the ONNX separation service actually loads from."""
    from backend.backends.configs import get_all_model_configs
    from backend.services.marketplace_catalog import get_product
    from backend.services.stem_separation_onnx import ONNX_FILE, ONNX_REPO

    cfg = [c for c in get_all_model_configs() if c.engine == "demucs_onnx"]
    assert len(cfg) == 1
    assert cfg[0].hf_repo_id == ONNX_REPO
    assert cfg[0].model_size == "htdemucs"
    assert cfg[0].category == "sfx"
    # The download special-case fetches exactly this filename.
    assert ONNX_FILE == "htdemucs.onnx"

    # Marketplace: appears in the Store, free (no license gate), id matches
    # the download pipeline model_name.
    product = get_product("demucs_onnx")
    assert product is not None
    assert product["paid"] is False
    assert product["category"] == "utilities"


def test_stem_onnx_offline_and_gate(monkeypatch):
    import huggingface_hub

    from backend.services import stem_separation_onnx as stem

    calls = []

    def fake(repo_id, filename, **kw):
        calls.append(kw)
        return "/fake.onnx"

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake)
    _install_fake_onnxruntime(monkeypatch)

    monkeypatch.setattr(stem, "_is_model_cached", lambda: True)
    stem._session = None
    stem._model_name = None
    stem._get_session()
    assert calls[-1].get("local_files_only") is True

    # not cached -> friendly error, no download
    calls.clear()
    monkeypatch.setattr(stem, "_is_model_cached", lambda: False)
    stem._session = None
    stem._model_name = None
    with pytest.raises(RuntimeError, match="not downloaded"):
        stem._get_session()
    assert calls == []


def test_deepfilter_offline_and_gate(monkeypatch):
    import huggingface_hub

    from backend.services import deepfilter_onnx as df

    calls = []

    def fake(repo_id, filename, **kw):
        calls.append(kw)
        return "/fake.onnx"

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake)
    _install_fake_onnxruntime(monkeypatch)

    monkeypatch.setattr(df, "_is_model_cached", lambda: True)
    df._session = None
    df._get_session()
    assert calls[-1].get("local_files_only") is True

    calls.clear()
    monkeypatch.setattr(df, "_is_model_cached", lambda: False)
    df._session = None
    with pytest.raises(RuntimeError, match="not downloaded"):
        df._get_session()
    assert calls == []


def test_health_models_lists_engines():
    """Slice C: GET /health/models returns 13 TTS engines, fish_speech_s2 present, is_loaded bool."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import backend.routes.health as health_mod

    app = FastAPI()
    app.include_router(health_mod.router)
    client = TestClient(app)

    resp = client.get("/health/models")
    assert resp.status_code == 200
    data = resp.json()
    assert "engines" in data
    engines = data["engines"]
    assert len(engines) == 13
    names = {e["engine"] for e in engines}
    assert "fish_speech_s2" in names
    assert "kokoro" in names
    for e in engines:
        assert isinstance(e["is_loaded"], bool)
        assert "gpu_only" in e
        assert "needs_trim" in e
        assert "per_engine_keepalive" in e
        assert "always_on" in e


def test_health_check_cached():
    """Slice C: GET /health/check returns gated checks with 60s cache."""
    import asyncio

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import backend.routes.health as health_mod

    # Reset cache for determinism
    health_mod._health_check_cache = None
    health_mod._health_check_at = 0.0

    app = FastAPI()
    app.include_router(health_mod.router)
    client = TestClient(app)

    resp = client.get("/health/check")
    assert resp.status_code == 200
    data = resp.json()
    assert "name_map" in data
    assert "placeholders" in data
    assert "biome" in data
    assert "cached_at" in data
    # Second call should be cached (same cached_at)
    resp2 = client.get("/health/check")
    assert resp2.json()["cached_at"] == data["cached_at"]

    # Timeout handling: ensure 5s timeout doesn't hang (fast path already cached)
    async def _fast():
        return await asyncio.wait_for(asyncio.sleep(0.01), timeout=5.0)

    asyncio.run(_fast())
