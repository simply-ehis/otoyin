"""Tests for conversation mixed-engine resampling (BUG-012)."""

import asyncio

import numpy as np

from backend.routes.conversation import _resample_to_common_rate


def _sine(freq: float, sr: int, seconds: float) -> np.ndarray:
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    return (np.sin(2 * np.pi * freq * t) * 0.5).astype(np.float32)


class _Line:
    def __init__(self, name: str):
        self.name = name


def test_same_rate_passthrough():
    lines = [
        (_sine(440, 24000, 0.1), 24000, _Line("a")),
        (_sine(441, 24000, 0.1), 24000, _Line("b")),
    ]
    out, sr = asyncio.run(_resample_to_common_rate(lines))
    assert sr == 24000
    assert len(out) == 2
    # Passthrough: arrays untouched (same objects)
    assert out[0][0] is lines[0][0]
    assert out[1][0] is lines[1][0]


def test_mixed_rates_resampled_to_largest():
    a = _sine(440, 22050, 0.1)
    b = _sine(440, 24000, 0.1)
    lines = [(a, 22050, _Line("low")), (b, 24000, _Line("high"))]
    out, sr = asyncio.run(_resample_to_common_rate(lines))
    assert sr == 24000
    assert [item[1] for item in out] == [24000, 24000]
    # 22050 Hz clip oversampled: 2205 samples -> ~2400
    assert abs(len(out[0][0]) - 2400) <= 2
    # Untouched high-rate line keeps its length
    assert len(out[1][0]) == len(b)


def test_single_line():
    lines = [(_sine(440, 16000, 0.1), 16000, _Line("solo"))]
    out, sr = asyncio.run(_resample_to_common_rate(lines))
    assert sr == 16000
    assert len(out) == 1
    assert len(out[0][0]) == 1600
