"""Tests for the 16-step drum pattern sequencer."""

import numpy as np

from backend.services.drum_machine import render_drum_pattern


def test_render_drum_pattern_length_and_energy():
    pattern = ["kick", ["snare", "hihat"], "", "hihat"] * 4
    step_duration = 0.125
    bars = 1
    audio = render_drum_pattern(pattern, step_duration, bars, velocity=0.8)
    step = int(step_duration * 48000)
    assert audio.shape[0] == step * len(pattern) * bars
    assert np.abs(audio).max() > 0
    # first step is a kick -> low-frequency energy present
    low = audio[: step // 4]
    assert np.abs(low).max() > 0


def test_empty_pattern_returns_silence():
    audio = render_drum_pattern([], velocity=0.8)
    assert audio.shape[0] == 1
    assert np.abs(audio).max() == 0.0


def test_unknown_voice_ignored():
    audio = render_drum_pattern(["not_a_drum"], velocity=0.8)
    assert np.abs(audio).max() == 0.0


def test_bars_scale_length():
    pattern = ["kick"]
    audio = render_drum_pattern(pattern, 0.125, bars=2, velocity=0.8)
    step = int(0.125 * 48000)
    assert audio.shape[0] == step * len(pattern) * 2
