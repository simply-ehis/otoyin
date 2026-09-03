"""Tests for the audio effects chain, focused on real (non-stub) behavior."""

import numpy as np

from backend.services.effects_chain import AudioEffectsChain


def _tone(freq: float, sr: int = 22050, dur: float = 0.2) -> np.ndarray:
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    return np.sin(2 * np.pi * freq * t).astype(np.float32)


def test_formant_shift_identity_at_factor_one():
    chain = AudioEffectsChain()
    audio = _tone(220.0)
    out = chain._apply_formant_shift(audio, 22050, {"shift_factor": 1.0})
    assert np.array_equal(out, audio)


def test_formant_shift_transforms_audio():
    chain = AudioEffectsChain()
    audio = _tone(220.0)
    out = chain._apply_formant_shift(audio, 22050, {"shift_factor": 1.5})
    # Must not be a silent no-op stub: the waveform/spectrum changes.
    assert not np.allclose(out, audio)
    assert out.dtype == np.float32
    assert out.shape == audio.shape


def test_formant_shift_handles_empty_audio():
    chain = AudioEffectsChain()
    out = chain._apply_formant_shift(np.array([], dtype=np.float32), 22050, {"shift_factor": 2.0})
    assert out.shape == (0,)


def _dominant_freq(audio: np.ndarray, sr: int = 22050) -> float:
    spectrum = np.abs(np.fft.rfft(audio))
    freqs = np.fft.rfftfreq(len(audio), d=1.0 / sr)
    return freqs[int(np.argmax(spectrum))]


def test_pitch_shift_changes_pitch_not_duration():
    chain = AudioEffectsChain()
    audio = _tone(220.0)
    out = chain._apply_pitch_shift(audio, 22050, {"semitones": 12})
    assert out.shape == audio.shape
    # +12 semitones should double the dominant frequency, not stretch duration.
    assert _dominant_freq(out) > _dominant_freq(audio) * 1.8


def test_pitch_shift_identity_at_zero():
    chain = AudioEffectsChain()
    audio = _tone(220.0)
    assert np.array_equal(chain._apply_pitch_shift(audio, 22050, {"semitones": 0}), audio)


def test_noise_gate_no_negative_index_at_start():
    chain = AudioEffectsChain()
    audio = np.zeros(100, dtype=np.float32)
    audio[10:20] = 0.5
    out = chain._apply_noise_gate(audio, 22050, {"threshold": -40.0, "release": 0.05})
    assert out.shape == audio.shape
    assert np.all(out >= -1.0)
    # Silent leading region stays silent (gate must not invert via bad indexing).
    assert np.allclose(out[:10], 0.0, atol=1e-6)


def test_sidechain_duck_sustains_and_releases():
    chain = AudioEffectsChain()
    sr = 22050
    # Loud sidechain for first half, quiet second half.
    audio = np.concatenate([np.full(sr, 0.9, dtype=np.float32), np.full(sr, 0.01, dtype=np.float32)])
    out = chain._apply_sidechain_duck(audio, sr, {"threshold": -30.0, "duck_gain": -12.0, "release": 0.1})
    # Ducked (attenuated) while sidechain is loud, near-unity once released.
    assert np.max(np.abs(out[:sr])) < 0.9
    assert np.allclose(out[sr:], audio[sr:], atol=0.05)


def test_compressor_does_not_crash_with_zero_attack():
    chain = AudioEffectsChain()
    audio = _tone(220.0)
    out = chain._apply_compressor(audio, 22050, {"threshold": -20.0, "ratio": 4.0, "attack": 0.0, "release": 0.0})
    assert out.shape == audio.shape
    assert np.all(np.isfinite(out))
    # Compression should reduce dynamic range, not amplify peaks past input.
    assert np.max(np.abs(out)) <= np.max(np.abs(audio)) + 1e-6
