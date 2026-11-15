"""Unit tests for Kokoro (audio.cpp kokoro_tts) backend.

Covers arg building (incl. language-code mapping and voice blending passthrough),
one-shot subprocess lifecycle via ``audio_cpp.run_one_shot``, error paths, the
54-voice table integrity, and registry wiring. No real model or binary is
required — everything is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, kokoro_tts_backend as kt
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_tts_args ─────────────────────────────────────────────────


def test_args_minimal():
    args = kt.build_tts_args(model="m.gguf", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "kokoro_tts"
    assert args[args.index("--model") + 1] == "m.gguf"
    assert args[args.index("--text") + 1] == "Hello"
    assert args[args.index("--voice-id") + 1] == "af_heart"
    assert args[args.index("--language") + 1] == "en-us"


def test_args_voice_and_language_mapping():
    args = kt.build_tts_args(model="m.gguf", text="你好", voice_id="zf_xiaobei", language="zh")
    assert args[args.index("--voice-id") + 1] == "zf_xiaobei"
    assert args[args.index("--language") + 1] == "zh"


def test_args_voice_blend_passthrough():
    blend = "af_heart(1)+jf_alpha(0.5)"
    args = kt.build_tts_args(model="m.gguf", text="mix", voice_id=blend, language="en")
    assert args[args.index("--voice-id") + 1] == blend


def test_args_seed():
    args = kt.build_tts_args(model="m.gguf", text="Hi", seed=42)
    assert args[args.index("--seed") + 1] == "42"


def test_voice_table_integrity():
    assert len(kt.KOKORO_VOICES) == 54
    ids = [v[0] for v in kt.KOKORO_VOICES]
    assert len(set(ids)) == 54
    assert kt.KOKORO_DEFAULT_VOICE in ids


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(kt.kokoro_backend.create_voice_prompt("ref.wav", "t"))
    assert prompt == {"voice_type": "preset", "preset_engine": "kokoro", "preset_voice_id": "af_heart"}
    assert cached is False


# ── generate (mocked subprocess) ───────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(kt, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(kt.KokoroTTSBackend, "_is_model_cached", lambda self, model_size="default": True)
    monkeypatch.setattr(kt.KokoroTTSBackend, "_get_model_path", lambda self, model_size: str(tmp_path / "m.gguf"))
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
    audio, sr = asyncio.run(kt.kokoro_backend.generate("Hello", {"preset_voice_id": "bm_george"}))
    assert sr == kt.KOKORO_SAMPLE_RATE
    assert len(audio) == 2400
    assert captured["args"][captured["args"].index("--voice-id") + 1] == "bm_george"


def test_generate_default_voice_when_prompt_empty(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(kt.kokoro_backend.generate("Hi", {}))
    assert captured["args"][captured["args"].index("--voice-id") + 1] == "af_heart"


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(kt, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(kt.kokoro_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(kt, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(kt.KokoroTTSBackend, "_is_model_cached", lambda self, model_size="default": False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(kt.kokoro_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="kokoro load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(kt.kokoro_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(kt.kokoro_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(kt.kokoro_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "kokoro" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("kokoro-onnx")
    assert cfg is not None
    assert cfg.engine == "kokoro"
    assert cfg.quant == "Q8_0"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_file == "Kokoro-82M-GGUF/kokoro-82m-q8_0.gguf"
    assert cfg.pip_packages == []
    assert "en" in cfg.languages


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("kokoro-onnx")
    assert product is not None


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("kokoro")
    assert backend is kt.kokoro_backend
