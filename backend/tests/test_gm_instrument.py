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
        pytest.skip("No SoundFont installed (Store instrument pack or data/soundfonts)")
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


def _use_data_dir(monkeypatch, tmp_path):
    from backend import config as app_config

    monkeypatch.setattr(app_config, "get_data_dir", lambda: tmp_path)
    return tmp_path


def test_discovers_store_bank_in_instruments_dir(monkeypatch, tmp_path):
    """Regression: a marketplace bank (GeneralUser-GS.sf2 under
    data/instruments/<pack>/) must be found — previously only
    data/soundfonts/ was searched, so Store banks never loaded."""
    _use_data_dir(monkeypatch, tmp_path)
    pack = tmp_path / "instruments" / "sf2-generaluser-gs"
    pack.mkdir(parents=True)
    bank = pack / "GeneralUser-GS.sf2"
    bank.write_bytes(b"x" * 2048)
    assert get_soundfont_path() == bank


def test_soundfonts_dir_wins_over_store(monkeypatch, tmp_path):
    """Explicit manual placement beats an auto-discovered Store bank."""
    _use_data_dir(monkeypatch, tmp_path)
    sf_dir = tmp_path / "soundfonts"
    sf_dir.mkdir(parents=True)
    manual = sf_dir / "FluidR3_GM.sf2"
    manual.write_bytes(b"x" * 16)
    pack = tmp_path / "instruments" / "some-pack"
    pack.mkdir(parents=True)
    (pack / "GeneralUser-GS.sf2").write_bytes(b"x" * 4096)
    assert get_soundfont_path() == manual


def test_ignores_sample_only_packs(monkeypatch, tmp_path):
    """Upload dirs with only .wav one-shots are not SoundFonts."""
    _use_data_dir(monkeypatch, tmp_path)
    pack = tmp_path / "instruments" / "drum-hits"
    pack.mkdir(parents=True)
    (pack / "kick.wav").write_bytes(b"x" * 104)
    assert get_soundfont_path() is None
