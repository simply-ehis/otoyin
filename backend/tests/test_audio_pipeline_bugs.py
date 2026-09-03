"""
Regression tests for audio_pipeline fixes:

- FIX A: sidechain ducking must be driven by the *sidechain* tracks, not the
  master's own loudness (previously the sidechain was decoded but ignored).
- FIX C: the ``21labs.generate_music`` name mapping must point at the music
  endpoint, not at TTS (``generate_speech``).
- FIX D: silence-removal dead loop removal must not change behaviour.
"""

import base64
import io
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.config import get_exports_dir, to_storage_path
from backend.routes.audio_pipeline.processing import router

SR = 24000

_app = FastAPI()
_app.include_router(router)
client = TestClient(_app)


def _wav_b64(audio: np.ndarray) -> str:
    buf = io.BytesIO()
    sf.write(buf, audio.astype(np.float32), SR, format="WAV")
    return base64.b64encode(buf.getvalue()).decode()


def _write_master(name: str, audio: np.ndarray) -> str:
    out = get_exports_dir() / name
    sf.write(str(out), audio.astype(np.float32), SR)
    return str(to_storage_path(out)).replace("\\", "/")


def _read_out(storage_path: str) -> np.ndarray:
    resolved = get_exports_dir() / Path(storage_path).name
    audio, _ = sf.read(str(resolved), dtype="float32", always_2d=False)
    return audio


def _duck(audio_path: str, track_configs):
    r = client.post(f"/audio/duck?audio_path={audio_path}", json=track_configs)
    assert r.status_code == 200, r.text
    return _read_out(r.json()["output_path"])


def test_sidechain_duck_uses_track_audio():
    n = int(2.0 * SR)
    master = (0.3 * np.sin(2 * np.pi * 220 * np.arange(n) / SR)).astype(np.float32)
    sp = _write_master("duck_master.wav", master)
    # Loud sidechain in the first half, silent in the second half.
    side = np.zeros(n, dtype=np.float32)
    side[: n // 2] = (0.6 * np.sin(2 * np.pi * 110 * np.arange(n // 2) / SR)).astype(np.float32)
    out = _duck(sp, [{"track_id": "t1", "audio_data": _wav_b64(side)}])

    rms_first = np.sqrt(np.mean(out[: n // 2] ** 2))
    rms_second = np.sqrt(np.mean(out[n // 2 :] ** 2))
    # The first half (loud sidechain) must be ducked; the second must stay loud.
    assert rms_first < rms_second * 0.9, (rms_first, rms_second)


def test_sidechain_duck_no_tracks_leaves_master_unchanged():
    n = int(2.0 * SR)
    master = (0.3 * np.sin(2 * np.pi * 220 * np.arange(n) / SR)).astype(np.float32)
    sp = _write_master("duck_master_flat.wav", master)
    out = _duck(sp, [])

    # No sidechain → nothing to duck against → gain stays at 1.0.
    rms_first = np.sqrt(np.mean(out[: n // 2] ** 2))
    rms_second = np.sqrt(np.mean(out[n // 2 :] ** 2))
    assert rms_first == pytest.approx(rms_second, rel=0.05)
    assert rms_first == pytest.approx(np.sqrt(np.mean(master**2)), rel=0.05)


def test_generate_music_maps_to_music_endpoint():
    from backend.routes.assistant_tools.mappings import ENDPOINT_MAP, NAME_MAP

    assert ENDPOINT_MAP["generate_music"] == "/generate/music"
    # Must not misroute music generation to TTS (the old ``generate_speech`` bug).
    assert NAME_MAP["21labs.generate_music"] == "generate_music"


def test_silence_removal_removes_long_gap():
    n = int(3.0 * SR)
    sig = np.zeros(n, dtype=np.float32)
    tone = (0.3 * np.sin(2 * np.pi * 220 * np.arange(int(SR)) / SR)).astype(np.float32)
    sig[:SR] = tone
    sig[2 * SR : 3 * SR] = tone  # 1s tone, 1s silence, 1s tone

    sp = _write_master("silence_in.wav", sig)
    r = client.post(f"/audio/silence-removal?audio_path={sp}")
    assert r.status_code == 200, r.text
    out = _read_out(r.json()["output_path"])

    # The 1s gap should be removed → output is shorter than the 3s source.
    assert len(out) < n * 0.8
