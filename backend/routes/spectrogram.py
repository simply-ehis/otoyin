"""Spectrogram analysis endpoints."""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..errors import ERR_AUDIO_NOT_FOUND

router = APIRouter()


class SpectrogramRequest(BaseModel):
    audio_path: str
    fft_size: int = 2048
    hop_length: int = 512
    window: str = "hann"


@router.post("/audio/spectrogram")
async def compute_spectrogram(data: SpectrogramRequest):
    """Compute spectrogram data for visualization."""
    from .. import config
    from ..utils.async_audio import async_load_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    fft_size = min(data.fft_size, len(audio))
    hop = data.hop_length

    if data.window == "hann":
        window = np.hanning(fft_size)
    else:
        window = np.ones(fft_size)

    n_frames = 1 + (len(audio) - fft_size) // hop
    spectrogram = np.zeros((fft_size // 2 + 1, n_frames), dtype=np.float32)

    for i in range(n_frames):
        start = i * hop
        frame = audio[start : start + fft_size] * window
        fft = np.fft.rfft(frame)
        spectrogram[:, i] = np.abs(fft)

    spectrogram_db = 20 * np.log10(spectrogram + 1e-10)
    spectrogram_db = np.clip(spectrogram_db, -80, 0)
    spectrogram_normalized = (spectrogram_db + 80) / 80

    return {
        "data": spectrogram_normalized.tolist(),
        "sample_rate": sample_rate,
        "fft_size": fft_size,
        "hop_length": hop,
        "n_frames": n_frames,
        "frequency_bins": fft_size // 2 + 1,
    }
