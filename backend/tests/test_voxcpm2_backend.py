"""Unit tests for VoxCPM2 (audio.cpp voxcpm2) backend.

Covers arg building (incl. voice-design parenthesized prefix and reference
text), one-shot subprocess lifecycle via ``audio_cpp.run_one_shot``, error
paths, and registry wiring. No real model or binary is required — everything
is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, voxcpm2_backend as vcpm
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_tts_args ─────────────────────────────────────────────────


def test_args_minimal():
    args = vcpm.build_tts_args(model="m.gguf", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "voxcpm2"
    assert args[args.index("--model") + 1] == "m.gguf"
    assert args[args.index("--text") + 1] == "Hello"


def test_args_with_voice_ref():
    args = vcpm.build_tts_args(model="m.gguf", text="Hi", voice_wav="ref.wav")
    assert args[args.index("--voice-ref") + 1] == "ref.wav"
    assert "--reference-text" not in args


def test_args_ultimate_clone():
    args = vcpm.build_tts_args(model="m.gguf", text="Hi", voice_wav="ref.wav", reference_text="exact words")
    assert args[args.index("--reference-text") + 1] == "exact words"


def test_args_seed():
    args = vcpm.build_tts_args(model="m.gguf", text="Hi", seed=42)
    assert args[args.index("--seed") + 1] == "42"


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(vcpm.voxcpm2_backend.create_voice_prompt("ref.wav", "the transcript"))
    assert prompt == {
        "voice_type": "clone",
        "voice_wav": "ref.wav",
        "audio_path": "ref.wav",
        "reference_text": "the transcript",
    }
    assert cached is False


# ── generate (mocked subprocess) ───────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(vcpm, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(vcpm.VoxCPM2Backend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(vcpm.VoxCPM2Backend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(ac, "run_hidden", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_generate_success_voice_design(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(vcpm.voxcpm2_backend.generate("Hello", {"voice_type": "design"}, instruct="a calm woman"))
    assert sr == vcpm.SAMPLE_RATE
    assert len(audio) == 2400
    sent = captured["args"][captured["args"].index("--text") + 1]
    assert sent == "(a calm woman)Hello"


def test_generate_success_clone(monkeypatch, tmp_path):
    captured = {}
    ref = tmp_path / "ref.wav"
    ref.write_bytes(b"RIFF")

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(
        vcpm.voxcpm2_backend.generate(
            "Hello",
            {"voice_type": "clone", "voice_wav": str(ref), "reference_text": "exact words"},
        )
    )
    assert captured["args"][captured["args"].index("--voice-ref") + 1] == str(ref)
    assert captured["args"][captured["args"].index("--reference-text") + 1] == "exact words"


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(vcpm, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(vcpm.voxcpm2_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(vcpm, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(vcpm.VoxCPM2Backend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(vcpm.voxcpm2_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="voxcpm load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(vcpm.voxcpm2_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(vcpm.voxcpm2_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(vcpm.voxcpm2_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "voxcpm2" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("voxcpm2-q8")
    assert cfg is not None
    assert cfg.engine == "voxcpm2"
    assert cfg.clone_voice is True
    assert cfg.quant == "Q8_0"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert "en" in cfg.languages


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("voxcpm2-q8")
    assert product is not None


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("voxcpm2")
    assert backend is vcpm.voxcpm2_backend


def test_download_fetches_single_gguf(monkeypatch):
    installed = []

    def fake_install(repo_id, filename, **kwargs):
        installed.append((repo_id, filename))
        return "/app/models/x.gguf"

    import backend.services.model_files as model_files

    monkeypatch.setattr(model_files, "install_model_file", fake_install)

    from backend.routes.models import download as dl
    from backend.utils.hf_progress import HFProgressTracker

    cfg = configs_mod.get_model_config("voxcpm2-q8")
    asyncio.run(dl._download_model_files(cfg, "voxcpm2-q8", HFProgressTracker(), None))
    assert installed == [("audio-cpp/audio.cpp-gguf", vcpm.MODEL_FILE)]
