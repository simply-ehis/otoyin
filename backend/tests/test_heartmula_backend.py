"""Unit tests for the HeartMuLa 3B (audio.cpp sidecar) music backend.

Covers arg building, tag folding (genre/mood/tempo), binary resolution,
the one-shot subprocess lifecycle, error paths, registry/config/catalog
wiring, the license gate (catalog id == model_name), the /generate/music
route dispatch, and the MCP tool engine param. No real model or binary
is required - everything is monkeypatched.
"""

import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.config as cfg_mod
from backend.backends import heartmula_backend as hm
from backend.backends.protocols import MUSIC_ENGINES
from backend.services import marketplace_catalog

# ---------------------------------------------------------------- build_tags


def test_build_tags_full():
    assert hm.build_tags("Ambient", "Calm", 90) == "Ambient,Calm,90bpm"


def test_build_tags_omits_tempo():
    assert hm.build_tags("pop", "neutral", None) == "pop,neutral"


# ---------------------------------------------------------------- build_args


def test_args_minimal():
    args = hm.build_args(
        model_dir="models/HeartMuLa",
        text="warm guitar arpeggio",
        tags="pop,calm",
        duration_seconds=30.0,
        output="out.wav",
    )
    assert args == [
        "--task",
        "gen",
        "--family",
        "heartmula",
        "--model",
        "models/HeartMuLa",
        "--text",
        "warm guitar arpeggio",
        "--request-option",
        "tags=pop,calm",
        "--request-option",
        "duration_sec=30",
        "--out",
        "out.wav",
    ]


def test_args_full():
    args = hm.build_args(
        model_dir="models/HeartMuLa",
        text="a bright pop chorus with drums",
        tags="pop,bright,drums,120bpm",
        duration_seconds=45.5,
        output="out.wav",
        seed=42,
    )
    assert "--seed" in args and args[args.index("--seed") + 1] == "42"
    assert "--request-option" in args
    assert "duration_sec=45.5" in args


def test_args_no_seed_when_unset():
    args = hm.build_args(model_dir="m", text="t", tags="pop", duration_seconds=10.0, output="o.wav")
    assert "--seed" not in args


# ---------------------------------------------------------------- binary resolution


def test_find_audiocpp_env(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    monkeypatch.setenv("TWENTYLABS_AUDIOCPP", str(fake))
    assert hm.find_audiocpp() == fake


def test_find_audiocpp_bundled(monkeypatch, tmp_path):
    models = tmp_path / "models"
    bundled = models / "audiocpp_cli.exe"
    bundled.parent.mkdir(parents=True)
    bundled.write_bytes(b"")
    monkeypatch.delenv("TWENTYLABS_AUDIOCPP", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: models)
    assert hm.find_audiocpp() == bundled


def test_find_audiocpp_missing(monkeypatch):
    monkeypatch.delenv("TWENTYLABS_AUDIOCPP", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: Path("nope"))
    assert hm.find_audiocpp() is None


# ---------------------------------------------------------------- lifecycle


def test_load_model_missing_binary(monkeypatch):
    monkeypatch.setattr(hm, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        hm.heartmula_backend.load_model()


def test_load_model_not_cached(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        hm.heartmula_backend.load_model()


def test_load_model_ok(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: True)
    hm.heartmula_backend.load_model()
    assert hm.heartmula_backend.load_error is None


def test_is_available(monkeypatch):
    monkeypatch.setattr(hm, "find_audiocpp", lambda: Path("audiocpp_cli.exe"))
    assert hm.heartmula_backend.is_available() is True
    monkeypatch.setattr(hm, "find_audiocpp", lambda: None)
    assert hm.heartmula_backend.is_available() is False


def test_is_loaded_and_unload():
    assert hm.heartmula_backend.is_loaded() is False
    hm.heartmula_backend.unload_model()
    assert hm.heartmula_backend.is_loaded() is False


# ---------------------------------------------------------------- generate


def _write_wav(path: Path) -> None:
    import io

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, np.zeros(4800, dtype=np.float32), 48000, format="WAV")
    path.write_bytes(buf.getvalue())


def _fake_run(monkeypatch, tmp_path, returncode=0):
    """Monkeypatch subprocess.run to write a fake WAV and return a fake result."""

    def _run(args, **kwargs):
        out = args[args.index("--out") + 1]
        _write_wav(Path(out))
        return type(
            "FakeProc",
            (),
            {"returncode": returncode, "stdout": "", "stderr": "boom" if returncode else ""},
        )()

    monkeypatch.setattr(subprocess, "run", _run)


def test_generate_success(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    gguf = tmp_path / "heartmula-q8_0.gguf"
    gguf.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: True)
    monkeypatch.setattr(hm.heartmula_backend, "_local_gguf", lambda: str(gguf))
    _fake_run(monkeypatch, tmp_path)

    audio, sr = hm.heartmula_backend.generate(
        prompt="warm guitar arpeggio", duration_seconds=30.0, genre="ambient", mood="calm", tempo=90, seed=7
    )
    assert audio.ndim == 1
    assert sr == 48000


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(hm, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        hm.heartmula_backend.generate(prompt="piano")


def test_generate_model_not_cached(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        hm.heartmula_backend.generate(prompt="piano")


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    gguf = tmp_path / "heartmula-q8_0.gguf"
    gguf.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: True)
    monkeypatch.setattr(hm.heartmula_backend, "_local_gguf", lambda: str(gguf))
    _fake_run(monkeypatch, tmp_path, returncode=1)

    with pytest.raises(RuntimeError, match="audiocpp failed"):
        hm.heartmula_backend.generate(prompt="piano")


def test_generate_no_output_file(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    gguf = tmp_path / "heartmula-q8_0.gguf"
    gguf.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: True)
    monkeypatch.setattr(hm.heartmula_backend, "_local_gguf", lambda: str(gguf))
    monkeypatch.setattr(
        subprocess, "run", lambda args, **kw: type("P", (), {"returncode": 0, "stdout": "", "stderr": ""})()
    )

    with pytest.raises(RuntimeError, match="no WAV output"):
        hm.heartmula_backend.generate(prompt="piano")


def test_generate_timeout(monkeypatch, tmp_path):
    fake = tmp_path / "audiocpp_cli.exe"
    fake.write_bytes(b"")
    gguf = tmp_path / "heartmula-q8_0.gguf"
    gguf.write_bytes(b"")
    monkeypatch.setattr(hm, "find_audiocpp", lambda: fake)
    monkeypatch.setattr(hm.heartmula_backend, "_is_model_cached", lambda: True)
    monkeypatch.setattr(hm.heartmula_backend, "_local_gguf", lambda: str(gguf))

    def _raise(args, **kw):
        raise subprocess.TimeoutExpired(cmd=args, timeout=kw["timeout"])

    monkeypatch.setattr(subprocess, "run", _raise)

    with pytest.raises(TimeoutError, match="exceeded"):
        hm.heartmula_backend.generate(prompt="piano")


# ---------------------------------------------------------------- wiring


def test_engine_registered():
    assert "heartmula" in MUSIC_ENGINES


def test_config_present():
    from backend.backends import configs as configs_mod

    cfg = configs_mod.get_model_config("heartmula-3b")
    assert cfg is not None
    assert cfg.engine == "heartmula"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.quant == "Q8_0"
    assert cfg.size_mb == 7660


def test_catalog_id_matches_model_name():
    # The license gate in routes/models/download.py resolves entitlements by
    # model_name == catalog id - a mismatch would make the model undownloadable.
    product = marketplace_catalog.get_product("heartmula-3b")
    assert product is not None
    assert product["paid"] is True
    assert product["category"] == "music"


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_music_backend

    backend = get_music_backend("heartmula")
    assert backend is hm.heartmula_backend


# ---------------------------------------------------------------- download branch


def test_download_fetches_single_gguf(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    import backend.services.model_files as model_files
    from backend.routes.models import download as dl
    from backend.utils.hf_progress import HFProgressTracker

    fetched = []
    monkeypatch.setattr(
        model_files,
        "install_model_file",
        lambda repo_id, filename, **kw: fetched.append((repo_id, filename)) or "/app/models/x.gguf",
    )
    cfg = SimpleNamespace(engine="heartmula", hf_repo_id="audio-cpp/audio.cpp-gguf")
    asyncio.run(dl._download_model_files(cfg, "heartmula-3b", HFProgressTracker(), None))
    assert fetched == [("audio-cpp/audio.cpp-gguf", "HeartMuLa-GGUF/heartmula-q8_0.gguf")]


# ---------------------------------------------------------------- REST route dispatch


@pytest.fixture
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend.routes.generate import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_generate_music_route_heartmula(client, monkeypatch):

    class FakeBackend:
        def is_available(self):
            return True

        def generate(self, **kwargs):
            return np.zeros(48000, dtype=np.float32), 48000

    monkeypatch.setattr("backend.routes.generate.get_music_backend", lambda engine: FakeBackend())
    # Route's manifest gate checks the real download DB — pretend downloaded.
    monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a, **k: True)

    resp = client.post(
        "/generate/music",
        json={"engine": "heartmula", "prompt": "calm piano", "duration_seconds": 30, "tempo": 90},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content[:4] == b"RIFF"
