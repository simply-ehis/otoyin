"""Unit tests for MeanVC2 (audio.cpp meanvc2) backend.

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
from backend.backends import configs as configs_mod, meanvc2_backend as mcv
from backend.services import marketplace_catalog

# ── build_args ─────────────────────────────────────────────────────


def test_args_minimal():
    args = mcv.build_args(model="m.gguf", source="a.wav", reference="b.wav")
    assert args[args.index("--task") + 1] == "vc"
    assert args[args.index("--family") + 1] == "meanvc2"
    assert args[args.index("--audio") + 1] == "a.wav"
    assert args[args.index("--voice-ref") + 1] == "b.wav"
    assert "--seed" not in args


def test_args_seed():
    args = mcv.build_args(model="m.gguf", source="a.wav", reference="b.wav", seed=42)
    assert args[args.index("--seed") + 1] == "42"


# ── convert (mocked subprocess) ───────────────────────────────────


def _patch_convert(monkeypatch, tmp_path, run_impl, audio=None):
    monkeypatch.setattr(mcv, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(ac, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(mcv.MeanVC2Backend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(mcv.MeanVC2Backend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(ac, "run_hidden", run_impl)
    audio = np.zeros(1600, dtype=np.float32) if audio is None else audio
    monkeypatch.setattr(ac, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_convert_success(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--out") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _patch_convert(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(mcv.meanvc2_backend.convert("a.wav", "b.wav"))
    assert sr == mcv.SAMPLE_RATE
    assert len(audio) == 1600
    assert captured["args"][captured["args"].index("--audio") + 1] == "a.wav"
    assert captured["args"][captured["args"].index("--voice-ref") + 1] == "b.wav"


def test_convert_missing_binary(monkeypatch):
    monkeypatch.setattr(mcv, "find_audiocpp", lambda: None)
    with pytest.raises(RuntimeError, match="audiocpp_cli binary not found"):
        asyncio.run(mcv.meanvc2_backend.convert("a.wav", "b.wav"))


def test_convert_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(mcv, "find_audiocpp", lambda: Path(tmp_path) / "audiocpp_cli.exe")
    monkeypatch.setattr(mcv.MeanVC2Backend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(mcv.meanvc2_backend.convert("a.wav", "b.wav"))


def test_convert_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="boom")

    _patch_convert(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(mcv.meanvc2_backend.convert("a.wav", "b.wav"))


def test_convert_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _patch_convert(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(mcv.meanvc2_backend.convert("a.wav", "b.wav"))


def test_convert_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _patch_convert(monkeypatch, tmp_path, fake_run)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(mcv.meanvc2_backend.convert("a.wav", "b.wav"))


# ── registry / config wiring ───────────────────────────────────────


def test_config_present():
    cfg = configs_mod.get_model_config("meanvc2-fp32")
    assert cfg is not None
    assert cfg.engine == "meanvc2"
    assert cfg.clone_voice is True
    assert cfg.quant == "F32"
    assert cfg.hf_repo_id == "audio-cpp/audio.cpp-gguf"
    assert cfg.download_file == "MeanVC2-GGUF/meanvc2-120ms-40ms-fp32.gguf"
    assert cfg.pip_packages == []


def test_catalog_id_matches_model_name():
    product = marketplace_catalog.get_product("meanvc2-fp32")
    assert product is not None
    assert product["paid"] is True
