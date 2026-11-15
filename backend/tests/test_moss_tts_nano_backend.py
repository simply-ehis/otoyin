"""Unit tests for MOSS-TTS-Nano (audio.cpp moss_tts_nano) backend.

Covers arg building (tts vs clon task, ref audio, reference text),
one-shot subprocess lifecycle via ``audio_cpp.run_one_shot``, error paths,
reference-audio key compatibility (ref_audio / audio_path), and registry
wiring. No real model or binary is required — everything is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, moss_tts_nano_backend as mtts
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_tts_when_no_reference():
    args = mtts.build_args(model="m.gguf", text="Hello")
    assert args[args.index("--task") + 1] == "tts"
    assert args[args.index("--family") + 1] == "moss_tts_nano"
    assert "--voice-ref" not in args


def test_args_clon_with_reference():
    args = mtts.build_args(model="m.gguf", text="Hi", speaker_file="ref.wav", reference_text="exact")
    assert args[args.index("--task") + 1] == "clon"
    assert args[args.index("--voice-ref") + 1] == "ref.wav"
    assert args[args.index("--reference-text") + 1] == "exact"


def test_args_clon_omits_unneeded_reference_text():
    args = mtts.build_args(model="m.gguf", text="Hi", speaker_file="ref.wav")
    assert "--reference-text" not in args


def test_args_seed_and_temperature():
    args = mtts.build_args(model="m.gguf", text="Hi", seed=42, temperature=1.2)
    assert args[args.index("--seed") + 1] == "42"
    assert args[args.index("--temperature") + 1] == "1.2"


# ── voice prompts ───────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(mtts.moss_tts_nano_backend.create_voice_prompt("ref.wav", "transcript"))
    assert prompt == {
        "voice_type": "clone",
        "ref_audio": "ref.wav",
        "audio_path": "ref.wav",
        "reference_text": "transcript",
    }
    assert cached is False


# ── generate (mocked subprocess) ───────────────────────────────────


def _patch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    monkeypatch.setattr(mtts, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(mtts.MossTTSNanoBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(mtts.MossTTSNanoBackend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(ac, "run_hidden", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_generate_success_tts(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(mtts.moss_tts_nano_backend.generate("Hello", {}))
    assert sr == mtts.SAMPLE_RATE
    assert len(audio) == 2400
    assert captured["args"][captured["args"].index("--task") + 1] == "tts"


def test_generate_clone_uses_ref_audio_key(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(mtts.moss_tts_nano_backend.generate("Hi", {"ref_audio": "ref.wav", "reference_text": "words"}))
    assert captured["args"][captured["args"].index("--task") + 1] == "clon"
    assert captured["args"][captured["args"].index("--voice-ref") + 1] == "ref.wav"


def test_generate_missing_binary(monkeypatch):
    monkeypatch.setattr(mtts, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(mtts.moss_tts_nano_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(mtts, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(mtts.MossTTSNanoBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(mtts.moss_tts_nano_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="moss load failed: boom")

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(mtts.moss_tts_nano_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(mtts.moss_tts_nano_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(mtts.moss_tts_nano_backend.generate("Hi", {}))


# ── registry / config / license wiring ─────────────────────────────


def test_engine_registered():
    assert "moss_tts_nano" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("moss-tts-nano")
    assert cfg is not None
    assert cfg.engine == "moss_tts_nano"
    assert cfg.quant == "Q8_0"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_file == "MOSS-TTS-Nano-100M-GGUF/moss-tts-nano-100m-q8_0.gguf"
    assert cfg.pip_packages == []


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("moss-tts-nano")
    assert product is not None
    assert product["name"] == "MOSS TTS Nano"


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("moss_tts_nano")
    assert backend is mtts.moss_tts_nano_backend
