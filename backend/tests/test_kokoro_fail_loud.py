"""Kokoro backends fail loud on chunk errors — never silently drop sentences."""

import numpy as np
import pytest

from backend.backends.kokoro_onnx_backend import KokoroONNXBackend

LONG_TEXT = (
    "First sentence carries enough words to push past the chunk limit easily. "
    "Second sentence keeps going with even more words for good measure here. "
    "Third sentence makes sure the splitter produces several chunks in total. "
    "Fourth sentence seals it with additional filler words for extra length. "
    "Fifth sentence adds yet another full block of words to be extra safe. "
    "Sixth sentence guarantees the text is far beyond any single chunk size."
)


def _backend(monkeypatch, chunk_fn):
    backend = KokoroONNXBackend.__new__(KokoroONNXBackend)

    async def no_load(self=None):
        return None

    monkeypatch.setattr(KokoroONNXBackend, "load_model", no_load)
    monkeypatch.setattr(KokoroONNXBackend, "_generate_chunk", chunk_fn)
    return backend


async def test_timeout_propagates_with_chunk_index(monkeypatch):
    async def flaky(self, text, voice, lang, seed, timeout):
        if "Fourth" in text:
            raise TimeoutError("hung")
        return np.ones(50000, dtype=np.float32), 24000

    backend = _backend(monkeypatch, flaky)
    with pytest.raises(TimeoutError, match="2/"):
        await backend.generate(LONG_TEXT, {}, "en")


async def test_generic_failure_raises_not_skips(monkeypatch):
    async def broken(self, text, voice, lang, seed, timeout):
        raise ValueError("boom")

    backend = _backend(monkeypatch, broken)
    with pytest.raises(RuntimeError, match="1/"):
        await backend.generate(LONG_TEXT, {}, "en")


async def test_happy_path_concatenates(monkeypatch):
    async def ok(self, text, voice, lang, seed, timeout):
        return np.ones(50000, dtype=np.float32), 24000

    backend = _backend(monkeypatch, ok)
    audio, sr = await backend.generate(LONG_TEXT, {}, "en")
    assert sr == 24000
    assert len(audio) > 50000
