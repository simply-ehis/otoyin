"""Async wrappers for blocking audio I/O functions.

The rule: no subprocess.run / librosa / numpy DSP / soundfile / load_audio /
save_audio / reduce_noise in an async def handler.  Use these wrappers instead.

Usage::

    from ..utils.async_audio import async_load_audio, async_save_audio

    audio, sr = await async_load_audio(str(resolved))
    await asyncio.to_thread(save_audio, audio, path, sr)
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np


def async_load_audio(path: str):
    """Load audio off the event loop. Returns (audio, sample_rate)."""
    from .audio import load_audio

    return asyncio.to_thread(load_audio, path)


async def async_save_audio(audio: np.ndarray, path: str | Path, sample_rate: int) -> None:
    """Save audio off the event loop."""
    from .audio import save_audio

    await asyncio.to_thread(save_audio, audio, path, sample_rate)


async def async_reduce_noise(audio: np.ndarray, sample_rate: int, vad_threshold: float = 0.5) -> np.ndarray:
    """Apply RNNoise reduction off the event loop."""
    from ..services.noise_reduction import reduce_noise_rnnoise

    return await asyncio.to_thread(reduce_noise_rnnoise, audio, sample_rate, vad_threshold)


async def async_reduce_noise_deepfilter(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Apply DeepFilterNet noise reduction off the event loop."""
    from ..services.noise_reduction import reduce_noise_deepfilternet

    return await asyncio.to_thread(reduce_noise_deepfilternet, audio, sample_rate)
