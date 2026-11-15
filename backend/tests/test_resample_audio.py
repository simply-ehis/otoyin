"""Regression: resample_audio must exist and resample correctly
(it survived the VC backend migration to audio.cpp)."""

import numpy as np

from backend.utils.audio import resample_audio


def test_same_rate_is_passthrough():
    audio = np.linspace(-1, 1, 100, dtype=np.float32)
    out = resample_audio(audio, 44100, 44100)
    assert out.dtype == np.float32
    np.testing.assert_array_equal(out, audio)


def test_resample_22050_to_44100_doubles_length():
    audio = np.sin(np.linspace(0, 2 * np.pi, 2205, endpoint=False)).astype(np.float32)
    out = resample_audio(audio, 22050, 44100)
    assert out.dtype == np.float32
    assert abs(len(out) - 4410) <= 2


def test_resample_44100_to_22050_halves_length():
    audio = np.sin(np.linspace(0, 2 * np.pi, 4410, endpoint=False)).astype(np.float32)
    out = resample_audio(audio, 44100, 22050)
    assert out.dtype == np.float32
    assert abs(len(out) - 2205) <= 2
