"""Tests for the Send-to handoff endpoints.

GET /dsp/stream streams a stored audio file back (used by ?path= handoffs).
POST /effects/preview-path auditions an effects chain on a stored file.

The full app boot is not required — endpoint functions are exercised directly
with a monkeypatched data directory so no real user data is touched.
"""

import asyncio

import numpy as np
import pytest
import soundfile as sf

from backend import config
from backend.models.effects import EffectConfig, PreviewEffectsPathRequest
from backend.routes.audio_pipeline import dsp, presets


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """Redirect the storage layout at a temp directory."""
    captures = tmp_path / "captures"
    captures.mkdir()
    monkeypatch.setattr(config, "_data_dir", tmp_path)
    return tmp_path


@pytest.fixture
def wav_file(data_dir):
    """Write a 0.1 s sine wave into the (temp) captures dir."""
    path = data_dir / "captures" / "ut_handoff.wav"
    sr = 8000
    t = np.linspace(0, 0.1, int(sr * 0.1), endpoint=False)
    audio = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
    sf.write(str(path), audio, sr)
    return "captures/ut_handoff.wav"


def test_dsp_stream_serves_stored_file(data_dir, wav_file):
    response = dsp.stream_stored_audio(wav_file)
    assert response.media_type == "audio/wav"
    assert response.filename == "ut_handoff.wav"


def test_dsp_stream_unknown_path_returns_404(data_dir):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as excinfo:
        dsp.stream_stored_audio("captures/does-not-exist.wav")
    assert excinfo.value.status_code == 404


def test_dsp_stream_rejects_traversal(data_dir):
    with pytest.raises(ValueError):
        dsp.stream_stored_audio("../../etc/passwd")


def test_effects_preview_path_rejects_unknown_file(data_dir):
    from fastapi import HTTPException

    req = PreviewEffectsPathRequest(
        audio_path="captures/does-not-exist.wav",
        effects_chain=[EffectConfig(type="gain", params={"gain_db": 3.0})],
    )
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(presets.preview_effects_path(req))
    assert excinfo.value.status_code == 404


def test_effects_preview_path_rejects_traversal(data_dir):
    req = PreviewEffectsPathRequest(
        audio_path="../../etc/passwd",
        effects_chain=[EffectConfig(type="gain", params={"gain_db": 3.0})],
    )
    with pytest.raises(ValueError):
        asyncio.run(presets.preview_effects_path(req))


def test_effects_preview_path_returns_wav(data_dir, wav_file):
    async def run() -> bytes:
        req = PreviewEffectsPathRequest(
            audio_path=wav_file,
            effects_chain=[EffectConfig(type="gain", params={"gain_db": 3.0})],
        )
        response = await presets.preview_effects_path(req)
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
        return b"".join(chunks)

    assert asyncio.run(run()).startswith(b"RIFF")
