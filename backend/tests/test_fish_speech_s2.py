"""Unit tests for Fish Audio S2 Pro (audio.cpp fish_audio) backend.

Covers arg building, one-shot subprocess lifecycle via the shared
``audio_cpp.run_one_shot`` runner, bracket instruct normalization,
voice-clone validation, and registry wiring. No real model or binary
required — everything is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, fish_speech_s2_backend as s2
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_minimal():
    args = s2.build_args(model="m.gguf", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "fish_audio"
    assert args[args.index("--model") + 1] == "m.gguf"
    assert args[args.index("--text") + 1] == "Hello"


def test_args_with_clone():
    args = s2.build_args(
        model="m.gguf",
        text="Hi",
        speaker_file="ref.wav",
        reference_text="hello",
        seed=42,
        temperature=0.7,
    )
    assert args[args.index("--task") + 1] == "clon"
    assert args[args.index("--voice-ref") + 1] == "ref.wav"
    assert args[args.index("--reference-text") + 1] == "hello"
    assert args[args.index("--seed") + 1] == "42"
    assert args[args.index("--temperature") + 1] == "0.7"


def test_args_clone_without_reference_text():
    args = s2.build_args(model="m.gguf", text="Hi", speaker_file="ref.wav")
    assert "--reference-text" not in args


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(s2.fish_speech_s2_backend.create_voice_prompt("ref.wav", "the transcript"))
    assert prompt == {"voice_type": "clone", "audio_path": "ref.wav", "reference_text": "the transcript"}
    assert cached is False


# ── generate validation (before binary check) ──────────────────────


def test_generate_empty_audio_path_raises_before_binary(monkeypatch):
    monkeypatch.setattr(s2, "find_audiocpp", lambda: None)
    with pytest.raises(ValueError, match="reference audio path is empty"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {"voice_type": "clone", "audio_path": ""}))


def test_generate_missing_audio_file_raises(monkeypatch, tmp_path):
    monkeypatch.setattr(s2, "find_audiocpp", lambda: Path("dummy"))
    with pytest.raises(ValueError, match="Reference audio not found"):
        asyncio.run(
            s2.fish_speech_s2_backend.generate("Hi", {"voice_type": "clone", "audio_path": str(tmp_path / "nope.wav")})
        )


# ── generate instruct normalization ────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(s2, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(ac, "run_hidden", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_instruct_bracket_normalization(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(s2.fish_speech_s2_backend.generate("Hello", {"voice_type": "preset"}, instruct="angry"))
    sent = captured["args"][captured["args"].index("--text") + 1]
    assert sent == "[angry] Hello"


def test_generate_success(monkeypatch, tmp_path):
    captured = {}
    ref = tmp_path / "ref.wav"
    ref.write_bytes(b"RIFF" + b"\0" * 32)

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(
        s2.fish_speech_s2_backend.generate("Hello world", {"voice_type": "clone", "audio_path": str(ref)})
    )
    assert sr == s2.SAMPLE_RATE
    assert len(audio) == 2400
    assert args_have(captured["args"], "--voice-ref", str(ref))


def args_have(args: list[str], flag: str, value: str) -> bool:
    return flag in args and args[args.index(flag) + 1] == value


# ── lifecycle / errors ─────────────────────────────────────────────


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(s2, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(s2, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="model load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "fish_speech_s2" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("fish-speech-s2-pro")
    assert cfg is not None
    assert cfg.engine == "fish_speech_s2"
    assert cfg.clone_voice is True
    assert cfg.quant == "Q8_0"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert "en" in cfg.languages


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("fish-speech-s2-pro")
    assert product is not None


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("fish_speech_s2")
    assert backend is s2.fish_speech_s2_backend


def test_subprocess_engine_skips_vram():
    from backend.backends.registry import ENGINE_REGISTRY

    row = next(e for e in ENGINE_REGISTRY if e.engine == "fish_speech_s2")
    assert row.singleton_attr == "fish_speech_s2_backend"


# ── download branch ─────────────────────────────────────────────────


def test_download_fetches_single_gguf(monkeypatch):
    installed = []

    def fake_install(repo_id, filename, **kwargs):
        installed.append((repo_id, filename))
        return "/app/models/x.gguf"

    import backend.services.model_files as model_files

    monkeypatch.setattr(model_files, "install_model_file", fake_install)

    from backend.routes.models import download as dl
    from backend.utils.hf_progress import HFProgressTracker

    cfg = configs_mod.get_model_config("fish-speech-s2-pro")
    asyncio.run(dl._download_model_files(cfg, "fish-speech-s2-pro", HFProgressTracker(), None))
    assert installed == [("audio-cpp/audio.cpp-gguf", s2.MODEL_FILE)]
