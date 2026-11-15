"""Unit tests for NeuTTS-2E (audio.cpp neutts) backend.

Covers arg building (voice + emotion), one-shot subprocess lifecycle via
``audio_cpp.run_one_shot``, error paths, voice/emotion validation, and
registry wiring. No cloning — the audiocpp neutts family is built-in voices
only. No real model or binary is required — everything is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, neutts_2e_backend as n2e
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_default_voice_neutral():
    args = n2e.build_args(model="m.gguf", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "neutts"
    assert args[args.index("--voice-id") + 1] == "emily"
    assert "--request-option" not in args


def test_args_voice_and_emotion():
    args = n2e.build_args(model="m.gguf", text="Hello", voice_id="dave", emotion="happy")
    assert args[args.index("--voice-id") + 1] == "dave"
    assert args[args.index("--request-option") + 1] == "emotion=happy"


def test_args_seed():
    args = n2e.build_args(model="m.gguf", text="Hi", seed=42)
    assert args[args.index("--seed") + 1] == "42"


# ── voice prompts / validation ─────────────────────────────────────


def test_create_voice_prompt_preset():
    prompt, cached = asyncio.run(n2e.neutts_2e_backend.create_voice_prompt(None, ""))
    assert prompt["speaker"] == "emily"
    assert prompt["emotion"] == "neutral"
    assert cached is False


def test_combine_voice_prompts():
    prompts = [{"speaker": "dave"}, {"speaker": "emily"}]
    assert asyncio.run(n2e.neutts_2e_backend.combine_voice_prompts(prompts)) == {"speaker": "dave"}


def test_generate_bad_voice_and_emotion_fall_back(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    monkeypatch.setattr(n2e, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(n2e.NeuTTS2EBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(n2e.NeuTTS2EBackend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(ac, "run_hidden", fake_run)
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (np.zeros(100, dtype=np.float32), sample_rate))
    asyncio.run(n2e.neutts_2e_backend.generate("Hi", {"speaker": "bogus", "emotion": "ecstatic"}))
    args = captured["args"]
    assert args[args.index("--voice-id") + 1] == "emily"
    assert args[args.index("--request-option") + 1] == "emotion=neutral"


# ── generate (mocked subprocess) ───────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(n2e, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(n2e.NeuTTS2EBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(n2e.NeuTTS2EBackend, "_local_file", lambda self, f: str(tmp_path / f))
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
    audio, sr = asyncio.run(n2e.neutts_2e_backend.generate("Hello", {"speaker": "greta", "emotion": "sad"}))
    assert sr == n2e.SAMPLE_RATE
    assert len(audio) == 2400
    args = captured["args"]
    assert args[args.index("--voice-id") + 1] == "greta"
    assert args[args.index("--request-option") + 1] == "emotion=sad"


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(n2e, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(n2e.neutts_2e_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(n2e, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(n2e.NeuTTS2EBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(n2e.neutts_2e_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="neutts load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(n2e.neutts_2e_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(n2e.neutts_2e_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(n2e.neutts_2e_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "neutts_2e" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("neutts-2e-orig")
    assert cfg is not None
    assert cfg.engine == "neutts_2e"
    assert cfg.clone_voice is False
    assert cfg.emotion_control is True
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_file == "NeuTTS-2E-GGUF/neutts-2e-orig.gguf"
    assert cfg.pip_packages == []
    assert {v.id for v in cfg.structured_preset_voices} == set(n2e.NEUTTS_SPEAKERS)


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("neutts-2e-orig")
    assert product is not None
    assert product["name"] == "NeuTTS-2E"


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("neutts_2e")
    assert backend is n2e.neutts_2e_backend
