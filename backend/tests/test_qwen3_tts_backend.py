"""Unit tests for the Qwen3-TTS (GGUF / llama-tts) backend.

Covers arg building, binary resolution, the one-shot subprocess lifecycle,
error paths, and the license-gate wiring (catalog id == model_name).
No real model or binary is required — everything is monkeypatched.
"""

import asyncio
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from backend.backends import configs as configs_mod, qwen3_tts_backend as qtts
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_tts_args ─────────────────────────────────────────────────────


def test_args_minimal():
    args = qtts.build_tts_args(
        backbone="b.gguf",
        mmproj="m.gguf",
        text="Hello",
        output="out.wav",
    )
    assert args == [
        "-m",
        "b.gguf",
        "-mm",
        "m.gguf",
        "-p",
        "Hello",
        "--tts-lang",
        "en",
        "-n",
        str(qtts.MAX_FRAMES),
        "-o",
        "out.wav",
    ]


def test_args_full():
    args = qtts.build_tts_args(
        backbone="b.gguf",
        mmproj="m.gguf",
        text="こんにちは",
        output="o.wav",
        language="ja",
        seed=42,
        speaker_file="ref.wav",
    )
    assert "--tts-lang" in args and args[args.index("--tts-lang") + 1] == "ja"
    assert "-s" in args and args[args.index("-s") + 1] == "42"
    assert "--tts-speaker-file" in args and args[args.index("--tts-speaker-file") + 1] == "ref.wav"


# ── binary resolution ──────────────────────────────────────────────────


def test_find_llama_tts_env(monkeypatch, tmp_path):
    fake = tmp_path / "llama-tts.exe"
    fake.write_bytes(b"x")
    monkeypatch.setenv("TWENTYLABS_LLAMA_TTS", str(fake))
    assert qtts.find_llama_tts() == fake


def test_find_llama_tts_bundled(monkeypatch, tmp_path):
    import backend.config as cfg_mod

    models_dir = tmp_path / "models"
    models_dir.mkdir()
    bundled = models_dir / ("llama-tts.exe" if sys.platform == "win32" else "llama-tts")
    bundled.write_bytes(b"x")

    monkeypatch.delenv("TWENTYLABS_LLAMA_TTS", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: models_dir)
    assert qtts.find_llama_tts() == bundled


def test_find_llama_tts_missing(monkeypatch, tmp_path):
    import backend.config as cfg_mod

    monkeypatch.delenv("TWENTYLABS_LLAMA_TTS", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "nope")
    assert qtts.find_llama_tts() is None


# ── voice prompts ─────────────────────────────────────────────────────


def test_create_voice_prompt():
    prompt, cached = asyncio.run(qtts.qwen3_tts_backend.create_voice_prompt("ref.wav", "the transcript"))
    assert prompt == {"voice_type": "clone", "audio_path": "ref.wav", "reference_text": "the transcript"}
    assert cached is False


# ── generate (mocked subprocess) ──────────────────────────────────────


def _monkeypatch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    """Patch binary, cache, paths, subprocess.run, and audio loading."""
    monkeypatch.setattr(qtts, "find_llama_tts", lambda: Path(tmp_path) / "llama-tts.exe")
    monkeypatch.setattr(qtts.Qwen3TTSBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(qtts.Qwen3TTSBackend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(qtts.subprocess, "run", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    monkeypatch.setattr(qtts, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def test_generate_success(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("-o") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    audio, sr = asyncio.run(
        qtts.qwen3_tts_backend.generate("Hello world", {"voice_type": "clone", "audio_path": "ref.wav"})
    )
    assert sr == qtts.SAMPLE_RATE
    assert len(audio) == 2400
    assert "--tts-speaker-file" in captured["args"]


def test_generate_without_clone_prompt(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("-o") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {"voice_type": "preset"}))
    assert "--tts-speaker-file" not in captured["args"]


def test_generate_missing_binary(monkeypatch, tmp_path):
    monkeypatch.setattr(qtts, "find_llama_tts", lambda: None)
    with pytest.raises(RuntimeError, match="llama-tts binary not found"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(qtts, "find_llama_tts", lambda: Path(tmp_path) / "llama-tts.exe")
    monkeypatch.setattr(qtts.Qwen3TTSBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="model load failed: boom")

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(qtts.qwen3_tts_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
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
    assert "en" in cfg.languages


def test_catalog_id_matches_model_name():
    # The license gate in routes/models/download.py resolves entitlements by
    # model_name == catalog id — a mismatch would make the model undownloadable.
    product = marketplace_catalog.get_product("qwen3-tts-1.7b")
    assert product is not None
    assert product["paid"] is True


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("qwen3_tts")
    assert backend is qtts.qwen3_tts_backend


# ── download branch ───────────────────────────────────────────────────


def test_download_fetches_backbone_and_mmproj(monkeypatch):
    fetched = []

    def fake_download(repo_id, filename, **kwargs):
        fetched.append(filename)

    def fake_resolve(repo_id, quant_tag):
        return "Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf"

    # download.py imports these inside the function body — patch the sources.
    import huggingface_hub

    import backend.backends.gguf_server_backend as gguf_srv

    monkeypatch.setattr(gguf_srv, "_resolve_gguf_filename", fake_resolve)
    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_download)

    import asyncio

    from backend.routes.models import download as dl

    cfg = configs_mod.get_model_config("qwen3-tts-1.7b")
    from backend.utils.hf_progress import HFProgressTracker

    asyncio.run(dl._download_model_files(cfg, "qwen3-tts-1.7b", HFProgressTracker(), None))
    assert fetched == [
        "Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf",
        qtts.MMPROJ_FILENAME,
    ]
