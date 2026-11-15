"""Unit tests for Tone-Color-VC (audio.cpp tone_color_vc) backend.

Covers arg building, one-shot subprocess lifecycle via
``audio_cpp.run_one_shot``, and registry wiring. No real model or binary is
required — everything is monkeypatched.
"""

import asyncio
import subprocess
from pathlib import Path

import numpy as np
import pytest

import backend.backends.audio_cpp as ac
from backend.backends import configs as configs_mod, tone_color_vc_backend as tc
from backend.backends.protocols import TTS_ENGINES  # noqa: F401 — TTS_ENGINES must remain untouched
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_minimal():
    args = tc.build_args(model="m.gguf", source="a.wav", reference="b.wav")
    assert args[args.index("--task") + 1] == "vc"
    assert args[args.index("--family") + 1] == "tone_color_vc"
    assert args[args.index("--audio") + 1] == "a.wav"
    assert args[args.index("--voice-ref") + 1] == "b.wav"


def test_args_seed():
    args = tc.build_args(model="m.gguf", source="a.wav", reference="b.wav", seed=-1)
    assert args[args.index("--seed") + 1] == "-1"


# ── convert (mocked subprocess) ───────────────────────────────────


def _patch_convert(monkeypatch, tmp_path, run_impl, audio=None):
    monkeypatch.setattr(tc, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(tc.ToneColorVCBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(tc.ToneColorVCBackend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(ac, "run_hidden", run_impl)
    audio = np.zeros(4410, dtype=np.float32) if audio is None else audio
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_convert_success(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_convert(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(tc.tone_color_vc_backend.convert("a.wav", "b.wav"))
    assert sr == tc.SAMPLE_RATE
    assert len(audio) == 4410


def test_convert_missing_binary(monkeypatch):
    monkeypatch.setattr(tc, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(tc.tone_color_vc_backend.convert("a.wav", "b.wav"))


def test_convert_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(tc, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(tc.ToneColorVCBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(tc.tone_color_vc_backend.convert("a.wav", "b.wav"))


def test_convert_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="boom")

    _patch_convert(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(tc.tone_color_vc_backend.convert("a.wav", "b.wav"))


def test_convert_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_convert(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(tc.tone_color_vc_backend.convert("a.wav", "b.wav"))


def test_convert_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_convert(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(tc.tone_color_vc_backend.convert("a.wav", "b.wav"))


# ── registry / config wiring ───────────────────────────────────────


def test_config_present():
    cfg = configs_mod.get_model_config("tone-color-vc-f16")
    assert cfg is not None
    assert cfg.engine == "tone_color_vc"
    assert cfg.clone_voice is True
    assert cfg.quant == "F16"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_file == "Tone-Color-VC-GGUF/tone-color-vc-f16.gguf"
    assert cfg.pip_packages == []


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("tone-color-vc-f16")
    assert product is not None
    assert product["paid"] is True
