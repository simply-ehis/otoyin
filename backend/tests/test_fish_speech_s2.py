"""Unit tests for Fish Audio S2 Pro (GGUF / s2.cpp) backend.

Covers arg building, binary resolution, one-shot subprocess lifecycle,
bracket instruct normalization, voice-clone validation, and registry wiring.
No real model or binary required — everything is monkeypatched.
"""

import asyncio
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from backend.backends import configs as configs_mod, fish_speech_s2_backend as s2
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── _build_s2_args ──────────────────────────────────────────────────


def test_build_args_minimal():
    args = s2._build_s2_args(
        gguf_path="m.gguf",
        tokenizer_path="tok.json",
        text="Hello",
        output="out.wav",
    )
    assert args == ["-m", "m.gguf", "-t", "tok.json", "-text", "Hello", "-v", "0", "-o", "out.wav"]


def test_build_args_with_clone():
    args = s2._build_s2_args(
        gguf_path="m.gguf",
        tokenizer_path="tok.json",
        text="Hi",
        output="o.wav",
        ref_audio="ref.wav",
        ref_text="hello",
        seed=42,
        temperature=0.7,
    )
    assert "-pa" in args and args[args.index("-pa") + 1] == "ref.wav"
    assert "-pt" in args and args[args.index("-pt") + 1] == "hello"
    assert "-s" in args and args[args.index("-s") + 1] == "42"
    assert "-temp" in args


# ── binary resolution ───────────────────────────────────────────────


def test_find_s2_cpp_env(monkeypatch, tmp_path):
    fake = tmp_path / "s2.exe"
    fake.write_bytes(b"x")
    monkeypatch.setenv("TWENTYLABS_S2_CPP", str(fake))
    assert s2.find_s2_cpp() == fake


def test_find_s2_cpp_bundled(monkeypatch, tmp_path):
    import backend.config as cfg_mod

    models_dir = tmp_path / "models"
    models_dir.mkdir()
    bundled = models_dir / ("s2.exe" if sys.platform == "win32" else "s2")
    bundled.write_bytes(b"x")
    monkeypatch.delenv("TWENTYLABS_S2_CPP", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: models_dir)
    assert s2.find_s2_cpp() == bundled


def test_find_s2_cpp_missing(monkeypatch, tmp_path):
    import backend.config as cfg_mod

    monkeypatch.delenv("TWENTYLABS_S2_CPP", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "nope")
    # also ensure not on PATH
    monkeypatch.setattr("shutil.which", lambda _: None)
    assert s2.find_s2_cpp() is None


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(s2.fish_speech_s2_backend.create_voice_prompt("ref.wav", "the transcript"))
    assert prompt == {"voice_type": "clone", "audio_path": "ref.wav", "reference_text": "the transcript"}
    assert cached is False


# ── generate validation (before binary check) ───────────────────────


def test_generate_empty_audio_path_raises_before_binary(monkeypatch):
    # Even with no binary, empty clone path should raise ValueError first
    monkeypatch.setattr(s2, "find_s2_cpp", lambda: None)
    with pytest.raises(ValueError, match="reference audio path is empty"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {"voice_type": "clone", "audio_path": ""}))


def test_generate_missing_audio_file_raises(monkeypatch, tmp_path):
    monkeypatch.setattr(s2, "find_s2_cpp", lambda: Path("dummy"))
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_is_model_cached", lambda self: True)
    with pytest.raises(ValueError, match="Reference audio not found"):
        asyncio.run(
            s2.fish_speech_s2_backend.generate("Hi", {"voice_type": "clone", "audio_path": str(tmp_path / "nope.wav")})
        )


# ── generate instruct normalization ─────────────────────────────────


def _monkeypatch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(s2, "find_s2_cpp", lambda: Path(tmp_path) / "s2.exe")
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(s2.subprocess, "run", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    # patch load_audio to avoid file read
    import backend.utils.audio as audio_mod

    monkeypatch.setattr(audio_mod, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_instruct_bracket_normalization(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        if "-text" in args:
            captured["text"] = args[args.index("-text") + 1]
        Path(args[args.index("-o") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(s2.fish_speech_s2_backend.generate("Hello", {}, instruct="angry"))
    assert captured["text"] == "[angry] Hello"

    captured.clear()
    asyncio.run(s2.fish_speech_s2_backend.generate("Hello", {}, instruct="[sad]"))
    assert captured["text"] == "[sad] Hello"

    captured.clear()
    asyncio.run(s2.fish_speech_s2_backend.generate("Hello", {}, instruct="(whisper)"))
    assert captured["text"] == "[whisper] Hello"


def test_generate_success(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("-o") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    Path(tmp_path / "ref.wav").write_bytes(b"fake")
    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    _, sr = asyncio.run(
        s2.fish_speech_s2_backend.generate(
            "Hello", {"voice_type": "clone", "audio_path": str(tmp_path / "ref.wav"), "reference_text": "hi"}
        )
    )
    assert sr == s2.SAMPLE_RATE


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(s2, "find_s2_cpp", lambda: None)
    with pytest.raises(RuntimeError, match=r"s2\.cpp binary not found"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(s2, "find_s2_cpp", lambda: Path(tmp_path) / "s2.exe")
    monkeypatch.setattr(s2.FishSpeechS2Backend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="model load failed: boom")

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(s2.fish_speech_s2_backend.generate("Hi", {}))


# ── registry / config / license wiring ────────────────────────────────


def test_engine_registered():
    assert "fish_speech_s2" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("fish-speech-s2-pro")
    assert cfg is not None
    assert cfg.engine == "fish_speech_s2"
    assert cfg.clone_voice is True
    assert cfg.quant == "Q4_K_M"
    assert "en" in cfg.languages
    assert cfg.gpu_only is True


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("fish-speech-s2-pro")
    assert product is not None
    assert product["paid"] is True
    assert product["price_usd"] == 80


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("fish_speech_s2")
    assert backend is s2.fish_speech_s2_backend


def test_subprocess_engine_skips_vram():
    from backend.backends.registry import ENGINE_REGISTRY

    entry = next((e for e in ENGINE_REGISTRY if e.engine == "fish_speech_s2"), None)
    assert entry is not None
    assert entry.singleton_module == ".fish_speech_s2_backend"
    # Verify the VRAM gate list in registry.py contains the engine (read file)
    import pathlib

    text = pathlib.Path("backend/backends/registry.py").read_text(encoding="utf-8")
    assert '"fish_speech_s2"' in text or "'fish_speech_s2'" in text


def test_download_fetches_gguf_and_tokenizer(monkeypatch):
    fetched = []

    def fake_download(repo_id, filename, **kwargs):
        fetched.append(filename)

    import huggingface_hub

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_download)
    import asyncio

    from backend.routes.models import download as dl
    from backend.utils.hf_progress import HFProgressTracker

    cfg = configs_mod.get_model_config("fish-speech-s2-pro")
    asyncio.run(dl._download_model_files(cfg, "fish-speech-s2-pro", HFProgressTracker(), None))
    assert s2.S2_CPP_GGUF_DEFAULT in fetched
    assert s2.S2_CPP_TOKENIZER in fetched
