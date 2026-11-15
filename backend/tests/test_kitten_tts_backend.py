"""Unit tests for Kitten TTS (audio.cpp kitten_tts) backend.

Covers arg building, one-shot subprocess lifecycle via
``audio_cpp.run_one_shot``, error paths, and registry wiring. No real model
or binary is required — everything is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, kitten_tts_backend as kt
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_minimal_default_voice():
    args = kt.build_args(model="m.gguf", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "kitten_tts"
    assert args[args.index("--model") + 1] == "m.gguf"
    assert args[args.index("--voice-id") + 1] == "Bella"


def test_args_all_eight_voices_accepted():
    for voice in kt.KITTEN_VOICE_IDS:
        args = kt.build_args(model="m.gguf", text="Hi", voice_id=voice)
        assert args[args.index("--voice-id") + 1] == voice


def test_args_seed():
    args = kt.build_args(model="m.gguf", text="Hi", seed=42)
    assert args[args.index("--seed") + 1] == "42"


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(kt.kitten_tts_backend.create_voice_prompt("ref.wav", "t"))
    assert prompt == {"voice_type": "preset", "preset_engine": "kitten_tts", "preset_voice_id": "Bella"}
    assert cached is False


# ── generate (mocked subprocess) ───────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(kt, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(kt.KittenTTSBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(kt.KittenTTSBackend, "_local_file", lambda self, f: str(tmp_path / f))
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
    audio, sr = asyncio.run(kt.kitten_tts_backend.generate("Hello", {"preset_voice_id": "Kiki"}))
    assert sr == kt.SAMPLE_RATE
    assert len(audio) == 2400
    assert captured["args"][captured["args"].index("--voice-id") + 1] == "Kiki"


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(kt, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(kt.kitten_tts_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(kt, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(kt.KittenTTSBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(kt.kitten_tts_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="kitten load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(kt.kitten_tts_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(kt.kitten_tts_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(kt.kitten_tts_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "kitten_tts" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("kitten-tts-mini")
    assert cfg is not None
    assert cfg.engine == "kitten_tts"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_file == "KittenTTS-GGUF/kitten-tts-mini-0.8-orig.gguf"
    assert cfg.pip_packages == []
    assert cfg.preset_voices == kt.KITTEN_VOICE_IDS


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("kitten-tts-mini")
    assert product is not None
    assert product["name"] == "Kitten TTS"


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("kitten_tts")
    assert backend is kt.kitten_tts_backend
