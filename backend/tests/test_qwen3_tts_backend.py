"""Unit tests for the Qwen3-TTS (audio.cpp) backend.

Covers arg building, the one-shot subprocess lifecycle via the shared
``audio_cpp.run_one_shot`` runner, error paths, and the registry/config/
license wiring. No real model or binary is required — everything is
monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, qwen3_tts_backend as qtts
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_tts_args ─────────────────────────────────────────────────────


def test_args_minimal():
    args = qtts.build_tts_args(model="m.gguf", text="Hello")
    assert "--family" in args and args[args.index("--family") + 1] == "qwen3_tts"
    assert "--task" in args and args[args.index("--task") + 1] == "tts"
    assert args[args.index("--model") + 1] == "m.gguf"
    assert args[args.index("--text") + 1] == "Hello"


def test_args_language_and_seed():
    args = qtts.build_tts_args(model="m.gguf", text="こんにちは", language="ja", seed=42)
    assert args[args.index("--language") + 1] == "ja"
    assert args[args.index("--seed") + 1] == "42"


def test_args_clone_with_reference_text():
    args = qtts.build_tts_args(
        model="m.gguf",
        text="Hi",
        speaker_file="ref.wav",
        reference_text="exact words",
    )
    assert args[args.index("--voice-ref") + 1] == "ref.wav"
    assert args[args.index("--reference-text") + 1] == "exact words"


def test_args_clone_omits_reference_text_when_absent():
    args = qtts.build_tts_args(model="m.gguf", text="Hi", speaker_file="ref.wav")
    assert "--reference-text" not in args


# ── generate (mocked subprocess) ──────────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    """Patch binary, cache, paths, subprocess, and audio loading."""
    monkeypatch.setattr(qtts, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(qtts.Qwen3TTSBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(qtts.Qwen3TTSBackend, "_local_file", lambda self, f: str(tmp_path / f))
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
    audio, sr = asyncio.run(
        qtts.qwen3_tts_backend.generate("Hello world", {"voice_type": "clone", "audio_path": "ref.wav"})
    )
    assert sr == qtts.SAMPLE_RATE
    assert len(audio) == 2400
    assert args_have(captured["args"], "--voice-ref", "ref.wav")


def args_have(args: list[str], flag: str, value: str) -> bool:
    return flag in args and args[args.index(flag) + 1] == value


def test_generate_without_clone_prompt(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {"voice_type": "preset"}))
    assert "--voice-ref" not in captured["args"]


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(qtts, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(qtts, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(qtts.Qwen3TTSBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="model load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


# ── registry / config / license wiring ────────────────────────────────


def test_engine_registered():
    assert "qwen3_tts" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("qwen3-tts-1.7b")
    assert cfg is not None
    assert cfg.engine == "qwen3_tts"
    assert cfg.clone_voice is True
    assert cfg.quant == "Q8_0"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert "en" in cfg.languages


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("qwen3-tts-1.7b")
    assert product is not None
    assert product["paid"] is True


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("qwen3_tts")
    assert backend is qtts.qwen3_tts_backend


# ── download branch ───────────────────────────────────────────────────


def test_download_fetches_single_gguf(monkeypatch):
    installed = []

    def fake_install(repo_id, filename, **kwargs):
        installed.append((repo_id, filename))
        return "/app/models/x.gguf"

    import backend.services.model_files as model_files

    monkeypatch.setattr(model_files, "install_model_file", fake_install)

    from backend.routes.models import download as dl
    from backend.utils.hf_progress import HFProgressTracker

    cfg = configs_mod.get_model_config("qwen3-tts-1.7b")
    asyncio.run(dl._download_model_files(cfg, "qwen3-tts-1.7b", HFProgressTracker(), None))
    assert installed == [("audio-cpp/audio.cpp-gguf", qtts.MODEL_FILE)]
