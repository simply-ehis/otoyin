"""Tests for General-MIDI instrument rendering (TinySoundFont, gated)."""

import numpy as np
import pytest

pytest.importorskip("tinysoundfont")

from backend.services import gm_instrument
from backend.services.gm_instrument import get_soundfont_path, render_gm_note, render_gm_pattern


@pytest.fixture
def soundfont():
    path = get_soundfont_path()
    if path is None:
        pytest.skip("No SoundFont found in data/soundfonts")
    return path


def test_get_soundfont_path_finds_installed(soundfont):
    assert soundfont.exists()


def test_render_gm_note_returns_stereo_audio(soundfont):
    audio = render_gm_note(0, 60, 0.3, 0.8)
    assert audio.dtype == np.float32
    assert audio.ndim == 2
    assert audio.shape[1] == 2
    assert audio.shape[0] == int(0.3 * 48000) + int(0.3 * 48000)
    assert np.isfinite(audio).all()
    assert np.abs(audio).max() > 0


def test_render_gm_pattern_returns_loop(soundfont):
    notes = [60, 64, 67, 64]
    audio = render_gm_pattern(40, notes, step_duration=0.125, velocity=0.8)
    step = int(0.125 * 48000)
    assert audio.shape[0] == step * len(notes)
    assert np.abs(audio).max() > 0


def test_missing_soundfont_raises(monkeypatch):
    monkeypatch.setattr(gm_instrument, "get_soundfont_path", lambda: None)
    with pytest.raises(RuntimeError):
        render_gm_note(0, 60, 0.2, 0.8)
