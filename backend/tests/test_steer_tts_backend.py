"""Tests for SteerTTS backend (subprocess)."""

import pytest

from backends.steer_tts_backend import SteerTTSBackend


@pytest.mark.asyncio
async def test_steer_tts_generates_audio():
    backend = SteerTTSBackend()
    await backend.load_model("default")
    audio, sr = await backend.generate("Hello world", {})
    assert audio is not None
    assert len(audio) > 0
    assert sr == 24000


@pytest.mark.asyncio
async def test_steer_tts_instruct():
    backend = SteerTTSBackend()
    await backend.load_model("default")
    audio, _sr = await backend.generate("Hello world", {}, instruct="soft and sad")
    assert audio is not None
    assert len(audio) > 0


@pytest.mark.asyncio
async def test_steer_tts_markup():
    backend = SteerTTSBackend()
    await backend.load_model("default")
    audio, _sr = await backend.generate("Hello [whisper] world", {"markup": True})
    assert audio is not None
    assert len(audio) > 0


def test_steer_tts_is_loaded():
    backend = SteerTTSBackend()
    assert not backend.is_loaded()
    # load_model is async; just check type
    assert backend is not None
