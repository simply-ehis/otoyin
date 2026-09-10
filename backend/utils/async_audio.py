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


async def async_convert_audio_file(input_path, output_format, bitrate="128k", sample_rate=None):
    """Convert audio off the event loop (ffmpeg subprocess)."""
    from ..services.audio_conversion import convert_audio_file

    return await asyncio.to_thread(convert_audio_file, input_path, output_format, bitrate, sample_rate)


async def async_build_m4b(
    chapter_wavs, chapter_titles, output_path, cover_path=None, author=None, title=None, bitrate="64k"
):
    """Build .m4b off the event loop (3x ffmpeg subprocess)."""
    from ..services.audio_conversion import build_m4b

    return await asyncio.to_thread(
        build_m4b, chapter_wavs, chapter_titles, output_path, cover_path, author, title, bitrate
    )


async def async_apply_effects(audio, sample_rate, effects_chain):
    """Apply effect chain off the event loop (numpy DSP)."""
    from .effects import apply_effects

    return await asyncio.to_thread(apply_effects, audio, sample_rate, effects_chain)


async def async_normalize_audio(audio):
    """Normalize audio off the event loop (numpy DSP)."""
    from .audio import normalize_audio

    return await asyncio.to_thread(normalize_audio, audio)


async def async_audio_to_wav_bytes(audio, sample_rate):
    """Convert numpy array to WAV bytes off the event loop."""
    from ..services import tts

    return await asyncio.to_thread(tts.audio_to_wav_bytes, audio, sample_rate)


async def async_parse_book(path):
    """Parse EPUB/PDF book off the event loop."""
    from ..services.book_import import parse_book

    return await asyncio.to_thread(parse_book, path)
