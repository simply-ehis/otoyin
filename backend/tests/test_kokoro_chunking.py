"""Kokoro long-text chunking + wall-clock timeout (BUG-011).

Kokoro's G2P can stall on pathological input; long text must be pre-split into
~250-char sentence chunks with a timeout per chunk, and a hung chunk must
surface a TimeoutError (never a silently dropped sentence).
"""

import asyncio
import time

import numpy as np
import pytest
import torch

from backend.backends.kokoro_backend import (
    KOKORO_CHUNK_MAX_CHARS,
    KOKORO_CHUNK_TIMEOUT,
    KOKORO_SINGLE_TIMEOUT,
    KokoroTTSBackend,
)

_SAMPLE_RATE = 24000


class _Result:
    def __init__(self, audio: torch.Tensor):
        self.audio = audio


class _FastPipeline:
    def __call__(self, text, voice, speed=1.0):
        for _ in range(2):
            yield _Result(torch.zeros(_SAMPLE_RATE // 10))


@pytest.fixture
def backend(monkeypatch):
    b = KokoroTTSBackend()

    async def fake_load(*args, **kwargs):
        return None

    monkeypatch.setattr(b, "load_model", fake_load)
    monkeypatch.setattr(b, "_get_pipeline", lambda lang: _FastPipeline())
    return b


def _long_text() -> str:
    # 60 sentences ~ >250 chars total; forces multi-chunk generation.
    sentences = [f"Sentence number {i} carries enough padding text to matter here." for i in range(60)]
    return " ".join(sentences)


def test_short_text_uses_single_shot_path(backend, monkeypatch):
    seen = []

    async def fake_chunk(chunk_text, voice, language, seed, timeout):
        seen.append((chunk_text, timeout))
        return np.zeros(2400, dtype=np.float32), _SAMPLE_RATE

    monkeypatch.setattr(backend, "_generate_chunk", fake_chunk)
    audio, sr = asyncio.run(backend.generate("Hello world.", {}, "en", None))
    assert sr == _SAMPLE_RATE
    assert len(seen) == 1
    assert seen[0][1] == KOKORO_SINGLE_TIMEOUT
    assert len(audio) == 2400


def test_long_text_split_into_bounded_chunks(backend, monkeypatch):
    seen = []

    async def fake_chunk(chunk_text, voice, language, seed, timeout):
        seen.append((chunk_text, timeout))
        return np.zeros(2400, dtype=np.float32), _SAMPLE_RATE

    monkeypatch.setattr(backend, "_generate_chunk", fake_chunk)
    text = _long_text()
    audio, sr = asyncio.run(backend.generate(text, {}, "en", None))
    assert sr == _SAMPLE_RATE
    assert len(seen) >= 2, "expected long text to be split"
    assert all(len(chunk) <= KOKORO_CHUNK_MAX_CHARS for chunk, _ in seen)
    assert all(timeout == KOKORO_CHUNK_TIMEOUT for _, timeout in seen)
    assert len(audio) > 0


def test_chunk_timeout_raises_timeout_error(backend, monkeypatch):
    class _SlowPipeline:
        def __call__(self, text, voice, speed=1.0):
            time.sleep(2)
            return iter([])

    monkeypatch.setattr(backend, "_get_pipeline", lambda lang: _SlowPipeline())

    async def run():
        return await backend._generate_chunk("hello", "af_heart", "en", None, 0.1)

    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(run())


def test_hung_chunk_fails_loud_not_silently(backend, monkeypatch):
    async def hung_chunk(chunk_text, voice, language, seed, timeout):
        raise TimeoutError("hung G2P")

    monkeypatch.setattr(backend, "_generate_chunk", hung_chunk)

    async def run():
        return await backend.generate(_long_text(), {}, "en", None)

    with pytest.raises(TimeoutError, match="timed out"):
        asyncio.run(run())
