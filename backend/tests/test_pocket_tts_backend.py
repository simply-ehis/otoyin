"""Unit tests for Pocket TTS (audio.cpp pocket_tts) backend.

Covers arg building (packaged voices, clone), one-shot subprocess lifecycle
via ``audio_cpp.run_one_shot``, error paths, the 26-voice table integrity,
and registry wiring. No real model or binary is required — everything is
monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, pocket_tts_backend as pt
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_default_voice():
    args = pt.build_args(model_dir="/pkg/english", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "pocket_tts"
    assert args[args.index("--model") + 1] == "/pkg/english"
    assert args[args.index("--voice-id") + 1] == "alba"


def test_args_named_voice():
    args = pt.build_args(model_dir="/pkg/english", text="Hello", voice_id="cosette")
    assert args[args.index("--voice-id") + 1] == "cosette"


def test_args_clone_omits_voice_id():
    args = pt.build_args(model_dir="/pkg/english", text="Hello", speaker_file="ref.wav", voice_id="alba")
    assert args[args.index("--voice-ref") + 1] == "ref.wav"
    assert "--voice-id" not in args


def test_args_seed():
    args = pt.build_args(model_dir="/pkg/english", text="Hi", seed=42)
    assert args[args.index("--seed") + 1] == "42"


def test_voice_preset_table_integrity():
    from backend.backends.configs import tts as tts_cfg

    ids = tts_cfg._POCKET_TTS_PRESET_IDS
    assert len(ids) == 26
    assert len(set(ids)) == 26
    assert "alba" in ids and "cosette" in ids


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(pt.pocket_tts_backend.create_voice_prompt("ref.wav", "anything"))
    assert prompt == {"voice_type": "clone", "audio_path": "ref.wav", "reference_text": "anything"}
    assert cached is False


# ── generate (mocked subprocess) ───────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(pt, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(pt.PocketTTSBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(pt.PocketTTSBackend, "_get_model_path", lambda self, model_size: str(tmp_path / "pkg"))
    monkeypatch.setattr(ac, "run_hidden", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_generate_success(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(pt.pocket_tts_backend.generate("Hello", {"preset_voice_id": "marius"}))
    assert sr == pt.SAMPLE_RATE
    assert len(audio) == 2400
    assert captured["args"][captured["args"].index("--voice-id") + 1] == "marius"


def test_generate_clone(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(pt.pocket_tts_backend.generate("Hi", {"voice_type": "clone", "audio_path": "ref.wav"}))
    assert captured["args"][captured["args"].index("--voice-ref") + 1] == "ref.wav"
    assert "--voice-id" not in captured["args"]


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(pt, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(pt.pocket_tts_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(pt, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(pt.PocketTTSBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(pt.pocket_tts_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="pocket load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(pt.pocket_tts_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(pt.pocket_tts_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(pt.pocket_tts_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "pocket_tts" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("pocket-tts")
    assert cfg is not None
    assert cfg.engine == "pocket_tts"
    assert cfg.quant == "Q8_0"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_subtree == "PocketTTS-GGUF/english"
    assert cfg.pip_packages == []


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("pocket-tts")
    assert product is not None
    assert product["name"] == "Pocket TTS"


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("pocket_tts")
    assert backend is pt.pocket_tts_backend


def test_download_subtree_snapshots_english_dir(monkeypatch):
    patterns = []

    def fake_snapshot(repo_id, allow_patterns=None, **kwargs):
        patterns.append((repo_id, allow_patterns))
        return "/app/snapshot"

    import backend.services.model_files as model_files

    monkeypatch.setattr(model_files, "install_snapshot", fake_snapshot)

    from backend.routes.models import download as dl
    from backend.utils.hf_progress import HFProgressTracker

    cfg = configs_mod.get_model_config("pocket-tts")
    asyncio.run(dl._download_model_files(cfg, "pocket-tts", HFProgressTracker(), None))
    assert patterns == [("audio-cpp/audio.cpp-gguf", ["PocketTTS-GGUF/english/**"])]
