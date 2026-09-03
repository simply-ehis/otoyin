"""Tests for the comping assembly endpoint."""

import base64
import io

import numpy as np
import soundfile as sf
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.comping import router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _wav_base64(samples: np.ndarray, sr: int = 22050) -> str:
    buf = io.BytesIO()
    sf.write(buf, samples.astype(np.float32), sr, format="WAV")
    return base64.b64encode(buf.getvalue()).decode()


def test_assemble_synthetic_concatenates_in_order():
    segs = [
        {"start_ms": 0, "end_ms": 500, "tone_hz": 330},
        {"start_ms": 0, "end_ms": 300, "tone_hz": 392},
    ]
    r = _client().post("/comping/assemble", json={"segments": segs, "sample_rate": 22050})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    data, sr = sf.read(io.BytesIO(r.content))
    assert sr == 22050
    assert abs(len(data) - int(0.8 * 22050)) < int(0.05 * 22050)


def test_assemble_crossfade_shortens_output():
    segs = [
        {"start_ms": 0, "end_ms": 500, "tone_hz": 330},
        {"start_ms": 0, "end_ms": 300, "tone_hz": 392},
    ]
    r = _client().post(
        "/comping/assemble",
        json={"segments": segs, "sample_rate": 22050, "crossfade_ms": 15},
    )
    data, _ = sf.read(io.BytesIO(r.content))
    # crossfade removes one fade window from the concatenated length.
    assert abs(len(data) - (int(0.8 * 22050) - int(0.015 * 22050))) < 220


def test_assemble_slices_provided_audio():
    sr = 22050
    tone = (np.sin(2 * np.pi * 440 * np.arange(sr) / sr) * 0.6).astype(np.float32)
    payload = {
        "segments": [
            {"start_ms": 100, "end_ms": 300, "audio_base64": _wav_base64(tone, sr)},
        ],
        "sample_rate": sr,
    }
    r = _client().post("/comping/assemble", json=payload)
    assert r.status_code == 200
    data, _ = sf.read(io.BytesIO(r.content))
    assert abs(len(data) - int(0.2 * sr)) < int(0.01 * sr)


def test_assemble_rejects_empty_segments():
    r = _client().post("/comping/assemble", json={"segments": []})
    assert r.status_code == 400
