"""Unit tests for the Bark Small (GGUF / CrispASR) backend.

Covers arg building, binary resolution, voice .npz packing, the one-shot
subprocess lifecycle, error paths, and the license-gate wiring
(catalog id == model_name). No real model or binary is required —
everything is monkeypatched.
"""

import asyncio
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest

import backend.config as cfg_mod
from backend.backends import bark_backend as bark, configs as configs_mod
from backend.backends.protocols import TTS_ENGINES
from backend.services import marketplace_catalog

# ── build_tts_args ─────────────────────────────────────────────────────


def test_args_minimal():
    args = bark.build_tts_args(backbone="bark.gguf", text="Hello", output="out.wav")
    assert args == [
        "--backend",
        "bark",
        "-m",
        "bark.gguf",
        "--tts",
        "Hello",
        "--tts-output",
        "out.wav",
    ]


def test_args_full():
    args = bark.build_tts_args(
        backbone="bark.gguf",
        text="こんにちは",
        output="o.wav",
        voice_npz="voices/v2_ja_speaker_0.npz",
        seed=42,
        temperature=0.8,
    )
    assert "--voice" in args and args[args.index("--voice") + 1] == "voices/v2_ja_speaker_0.npz"
    assert "-s" in args and args[args.index("-s") + 1] == "42"
    assert "-temp" in args and args[args.index("-temp") + 1] == "0.8"


# ── voice id mapping ───────────────────────────────────────────────────


def test_voice_npy_filenames():
    assert bark.voice_npy_filenames("v2/en_speaker_0") == [
        "speaker_embeddings/v2/en_speaker_0_semantic_prompt.npy",
        "speaker_embeddings/v2/en_speaker_0_coarse_prompt.npy",
        "speaker_embeddings/v2/en_speaker_0_fine_prompt.npy",
    ]


def test_voice_npz_path_normalizes_slashes(monkeypatch, tmp_path):
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "models")
    assert bark.voice_npz_path("v2/en_speaker_0") == tmp_path / "models" / "bark" / "voices" / "v2_en_speaker_0.npz"


def test_voice_list_covers_all_languages():
    langs = {lang for _vid, _n, _g, lang in bark.BARK_VOICES}
    assert langs == {"en", "de", "es", "fr", "hi", "it", "ja", "ko", "pl", "pt", "ru", "tr", "zh"}
    assert len(bark.BARK_VOICES) == 26


# ── binary resolution ──────────────────────────────────────────────────


def test_find_crispasr_env(monkeypatch, tmp_path):
    fake = tmp_path / "crispasr.exe"
    fake.write_bytes(b"x")
    monkeypatch.setenv("TWENTYLABS_CRISPASR", str(fake))
    assert bark.find_crispasr() == fake


def test_find_crispasr_bundled(monkeypatch, tmp_path):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    bundled = models_dir / ("crispasr.exe" if sys.platform == "win32" else "crispasr")
    bundled.write_bytes(b"x")

    monkeypatch.delenv("TWENTYLABS_CRISPASR", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: models_dir)
    assert bark.find_crispasr() == bundled


def test_find_crispasr_missing(monkeypatch, tmp_path):
    import shutil

    import backend.utils.sidecar_downloader as sidecar

    monkeypatch.delenv("TWENTYLABS_CRISPASR", raising=False)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "nope")
    # get_data_dir is machine state (a downloaded data/bin/crispasr counts) —
    # pin it so "missing" means missing everywhere, on every machine.
    monkeypatch.setattr(cfg_mod, "get_data_dir", lambda: tmp_path / "no-data")
    monkeypatch.setattr(shutil, "which", lambda *args, **kwargs: None)
    monkeypatch.setattr(sidecar, "ensure_crispasr", lambda: None)
    assert bark.find_crispasr() is None


# ── voice packing ──────────────────────────────────────────────────────


def test_pack_voice_npz(monkeypatch, tmp_path):
    import huggingface_hub

    npy_dir = tmp_path / "npy"

    def fake_download(repo_id, filename, **kwargs):
        # Production downloads straight into local_dir; the fake must do the
        # same or install_model_file() will return a path that doesn't exist.
        root = Path(kwargs["local_dir"]) if "local_dir" in kwargs else npy_dir
        path = root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, np.zeros(768, dtype=np.float16))
        return str(path)

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_download)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "models")

    out = bark.bark_backend.pack_voice_npz("v2/en_speaker_0")
    assert out.exists()

    with zipfile.ZipFile(out) as zf:
        assert {m.filename for m in zf.infolist()} == {
            "semantic_prompt.npy",
            "coarse_prompt.npy",
            "fine_prompt.npy",
        }
        # The CrispASR npz parser only understands STORED members.
        assert all(m.compress_type == zipfile.ZIP_STORED for m in zf.infolist())

    with np.load(out, allow_pickle=False) as data:
        assert data["semantic_prompt"].shape == (768,)
        assert data["semantic_prompt"].dtype == np.float16


def test_pack_voice_npz_idempotent(monkeypatch, tmp_path):
    import huggingface_hub

    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "models")
    calls = []

    def fake_download(repo_id, filename, **kwargs):
        calls.append(filename)
        root = Path(kwargs["local_dir"]) if "local_dir" in kwargs else tmp_path
        path = root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, np.zeros(8))
        return str(path)

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake_download)

    bark.bark_backend.pack_voice_npz("v2/en_speaker_0")
    n_calls = len(calls)
    bark.bark_backend.pack_voice_npz("v2/en_speaker_0")
    assert len(calls) == n_calls


# ── voice prompts ─────────────────────────────────────────────────────


def test_create_voice_prompt_falls_back_to_default_preset():
    prompt, cached = asyncio.run(bark.bark_backend.create_voice_prompt("ref.wav", "the transcript"))
    assert prompt == {
        "voice_type": "preset",
        "preset_engine": "bark_small",
        "preset_voice_id": bark.BARK_DEFAULT_VOICE,
    }
    assert cached is False


# ── generate (mocked subprocess) ──────────────────────────────────────


def _monkeypatch_generate(monkeypatch, tmp_path, run_impl, wav_audio=None):
    """Patch binary, cache, paths, subprocess.run, and audio loading."""
    monkeypatch.setattr(bark, "find_crispasr", lambda: Path(tmp_path) / "crispasr.exe")
    monkeypatch.setattr(bark.BarkBackend, "_is_model_cached", lambda self: True)
    monkeypatch.setattr(bark.BarkBackend, "_local_file", lambda self, f: str(tmp_path / f))
    monkeypatch.setattr(bark.subprocess, "run", run_impl)
    audio = np.zeros(2400, dtype=np.float32) if wav_audio is None else wav_audio
    monkeypatch.setattr(bark, "load_audio", lambda path, sample_rate: (audio, sample_rate))


def _seed_voice(monkeypatch, tmp_path, voice_id="v2/en_speaker_0"):
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "models")
    npz = bark.voice_npz_path(voice_id)
    npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez(npz, semantic_prompt=np.zeros(8), coarse_prompt=np.zeros(8), fine_prompt=np.zeros(8))


def test_generate_success(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--tts-output") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    _seed_voice(monkeypatch, tmp_path)
    audio, sr = asyncio.run(
        bark.bark_backend.generate("Hello world", {"voice_type": "preset", "preset_voice_id": "v2/en_speaker_0"})
    )
    assert sr == bark.SAMPLE_RATE
    assert len(audio) == 2400
    assert "--backend" in captured["args"] and captured["args"][captured["args"].index("--backend") + 1] == "bark"
    assert "--voice" in captured["args"]
    assert captured["args"][captured["args"].index("--voice") + 1].endswith("v2_en_speaker_0.npz")


def test_generate_defaults_voice_when_prompt_empty(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        Path(args[args.index("--tts-output") + 1]).write_bytes(b"RIFF fake")
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    _seed_voice(monkeypatch, tmp_path)
    asyncio.run(bark.bark_backend.generate("Hi", {"voice_type": "preset"}))
    assert captured["args"][captured["args"].index("--voice") + 1].endswith("v2_en_speaker_0.npz")


def test_generate_missing_voice_pack(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    monkeypatch.setattr(cfg_mod, "get_models_dir", lambda: tmp_path / "models")
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(bark.bark_backend.generate("Hi", {"voice_type": "preset", "preset_voice_id": "v2/en_speaker_0"}))


def test_generate_missing_binary(monkeypatch, tmp_path):
    monkeypatch.setattr(bark, "find_crispasr", lambda: None)
    with pytest.raises(RuntimeError, match="CrispASR binary not found"):
        asyncio.run(bark.bark_backend.generate("Hi", {}))


def test_generate_model_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(bark, "find_crispasr", lambda: Path(tmp_path) / "crispasr.exe")
    monkeypatch.setattr(bark.BarkBackend, "_is_model_cached", lambda self: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(bark.bark_backend.generate("Hi", {}))


def test_generate_nonzero_exit(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, stderr="model load failed: boom")

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    _seed_voice(monkeypatch, tmp_path)
    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(bark.bark_backend.generate("Hi", {}))


def test_generate_no_output_file(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    _seed_voice(monkeypatch, tmp_path)
    with pytest.raises(RuntimeError, match="no WAV"):
        asyncio.run(bark.bark_backend.generate("Hi", {}))


def test_generate_timeout(monkeypatch, tmp_path):
    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=1)

    _monkeypatch_generate(monkeypatch, tmp_path, fake_run)
    _seed_voice(monkeypatch, tmp_path)
    with pytest.raises(TimeoutError, match="exceeded"):
        asyncio.run(bark.bark_backend.generate("Hi", {}))


# ── registry / config / license wiring ────────────────────────────────


def test_engine_registered():
    assert "bark_small" in TTS_ENGINES


def test_config_present():
    cfg = configs_mod.get_model_config("bark-small")
    assert cfg is not None
    assert cfg.engine == "bark_small"
    assert cfg.clone_voice is False
    assert cfg.quant == "q8_0"
    assert len(cfg.structured_preset_voices) == 26
    assert "en" in cfg.languages and "hi" in cfg.languages


def test_catalog_id_matches_model_name():
    # The license gate in routes/models/download.py resolves entitlements by
    # model_name == catalog id — a mismatch would make the model undownloadable.
    product = marketplace_catalog.get_product("bark-small")
    assert product is not None
    assert product["paid"] is True


def test_backend_factory_returns_singleton():
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("bark_small")
    assert backend is bark.bark_backend


def test_preset_voice_validation_accepts_bark():
    from backend.services.profiles import _get_preset_voice_ids

    ids = _get_preset_voice_ids("bark_small")
    assert "v2/en_speaker_0" in ids
    assert "v2/zh_speaker_5" in ids


# ── download branch ───────────────────────────────────────────────────


def test_download_fetches_gguf_and_packs_voices(monkeypatch):
    fetched = []
    packed = []

    def fake_install(repo_id, filename, **kwargs):
        fetched.append(filename)
        return "/app/models/x.gguf"

    def fake_resolve(repo_id, quant_tag):
        return "bark-small-q4_k.gguf"

    # download.py imports these inside the function body — patch the sources.
    import backend.backends.gguf_server_backend as gguf_srv
    import backend.services.model_files as model_files

    monkeypatch.setattr(gguf_srv, "_resolve_gguf_filename", fake_resolve)
    monkeypatch.setattr(model_files, "install_model_file", fake_install)
    monkeypatch.setattr(bark.bark_backend, "pack_voice_npz", lambda vid: packed.append(vid) or Path("x"))

    from backend.routes.models import download as dl

    cfg = configs_mod.get_model_config("bark-small")
    from backend.utils.hf_progress import HFProgressTracker

    asyncio.run(dl._download_model_files(cfg, "bark-small", HFProgressTracker(), None))
    assert fetched == ["bark-small-q4_k.gguf"]
    assert packed == [v[0] for v in bark.BARK_VOICES]
