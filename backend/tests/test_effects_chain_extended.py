"""Tests for effects chain processing.

Covers:
- apply_effects_chain with mixed enabled/disabled effects
- Unknown effect type raises (surfaced, never passed through silently)
- Chain ordering
- Edge cases: empty audio, empty chain, single effect
- Key effects: reverb, delay, distortion, EQ
"""

from __future__ import annotations

import numpy as np
import pytest

from backend.services.effects import (
    EffectConfig,
    apply_effect,
    apply_effects_chain,
)


def _tone(freq: float = 440.0, duration: float = 0.1, sr: int = 16000) -> np.ndarray:
    """Generate a sine tone."""
    t = np.linspace(0, duration, int(sr * duration), dtype=np.float32)
    return np.sin(2 * np.pi * freq * t)


def _silence(duration: float = 0.1, sr: int = 16000) -> np.ndarray:
    """Generate silence."""
    return np.zeros(int(sr * duration), dtype=np.float32)


# ---------------------------------------------------------------------------
# 1. apply_effects_chain
# ---------------------------------------------------------------------------


class TestApplyEffectsChain:
    def test_empty_chain_returns_audio_unchanged(self):
        audio = _tone()
        result = apply_effects_chain(audio, 16000, [])
        np.testing.assert_array_equal(result, audio)

    def test_disabled_effect_skipped(self):
        audio = _tone()
        chain = [EffectConfig(effect_type="distortion", enabled=False, params={})]
        result = apply_effects_chain(audio, 16000, chain)
        np.testing.assert_array_equal(result, audio)

    def test_single_enabled_effect_applied(self):
        audio = _tone()
        chain = [EffectConfig(effect_type="distortion", enabled=True, params={"drive": 5.0})]
        result = apply_effects_chain(audio, 16000, chain)
        # Distortion should change the audio
        assert not np.allclose(result, audio, atol=1e-6)

    def test_chain_ordering_matters(self):
        audio = _tone() * 0.5
        chain1 = [
            EffectConfig(effect_type="compressor", enabled=True, params={}),
            EffectConfig(effect_type="distortion", enabled=True, params={"drive": 3.0}),
        ]
        chain2 = [
            EffectConfig(effect_type="distortion", enabled=True, params={"drive": 3.0}),
            EffectConfig(effect_type="compressor", enabled=True, params={}),
        ]
        result1 = apply_effects_chain(audio, 16000, chain1)
        result2 = apply_effects_chain(audio, 16000, chain2)
        # Different orderings should produce different results
        assert not np.allclose(result1, result2, atol=1e-6)

    def test_mixed_enabled_disabled(self):
        audio = _tone()
        chain = [
            EffectConfig(effect_type="distortion", enabled=True, params={"drive": 5.0}),
            EffectConfig(effect_type="compressor", enabled=False, params={}),
            EffectConfig(effect_type="reverb", enabled=True, params={"room_size": 0.5}),
        ]
        result = apply_effects_chain(audio, 16000, chain)
        # Should be different from original (2 effects applied)
        assert not np.allclose(result, audio, atol=1e-6)

    def test_empty_audio(self):
        audio = _silence()
        chain = [EffectConfig(effect_type="distortion", enabled=True, params={"drive": 5.0})]
        result = apply_effects_chain(audio, 16000, chain)
        assert len(result) == len(audio)


# ---------------------------------------------------------------------------
# 2. apply_effect — individual effects
# ---------------------------------------------------------------------------


class TestApplyEffect:
    def test_unknown_effect_raises(self):
        audio = _tone()
        effect = EffectConfig(effect_type="nonexistent_effect", enabled=True, params={})
        with pytest.raises(ValueError):
            apply_effect(audio, 16000, effect)

    def test_distortion_changes_audio(self):
        audio = _tone() * 0.1  # Low amplitude
        effect = EffectConfig(effect_type="distortion", enabled=True, params={"drive": 10.0})
        result = apply_effect(audio, 16000, effect)
        assert not np.allclose(result, audio, atol=1e-6)

    def test_compressor_does_not_amplify(self):
        audio = _tone() * 0.3
        effect = EffectConfig(effect_type="compressor", enabled=True, params={})
        result = apply_effect(audio, 16000, effect)
        # Compressor should not make audio louder than input
        assert np.max(np.abs(result)) <= np.max(np.abs(audio)) * 1.1  # Small tolerance

    def test_reverb_extends_audio(self):
        audio = _tone(duration=0.05)
        effect = EffectConfig(effect_type="reverb", enabled=True, params={"room_size": 0.8, "damping": 0.5})
        result = apply_effect(audio, 16000, effect)
        # Reverb tail should extend the audio
        assert len(result) >= len(audio)

    def test_delay_creates_echoes(self):
        # Use 0.5s audio so the 50ms delay fits well within it
        audio = _silence(duration=0.5)
        # Place a click at the start
        audio[0] = 1.0
        effect = EffectConfig(effect_type="delay", enabled=True, params={"delay_ms": 50, "feedback": 0.5})
        result = apply_effect(audio, 16000, effect)
        # 50ms delay = 800 samples; echo should appear around sample 800
        assert np.max(np.abs(result[800:1200])) > 0.01

    def test_eq_changes_frequency_balance(self):
        # Create a signal with both low and high frequencies
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 100 * t) + np.sin(2 * np.pi * 5000 * t)
        audio = audio.astype(np.float32)

        # Apply high-pass EQ (boost highs, cut lows)
        effect = EffectConfig(
            effect_type="eq",
            enabled=True,
            params={"low_gain": -12.0, "mid_gain": 0.0, "high_gain": 6.0},
        )
        result = apply_effect(audio, 16000, effect)
        assert not np.allclose(result, audio, atol=1e-6)

    def test_pitch_shift_changes_frequency(self):
        audio = _tone(440.0)
        effect = EffectConfig(effect_type="pitch_shift", enabled=True, params={"semitones": 12.0})
        result = apply_effect(audio, 16000, effect)
        # 12 semitones up should double the frequency
        assert not np.allclose(result, audio, atol=1e-6)

    def test_noise_gate_silences_quiet_regions(self):
        # Create audio with loud start and quiet end
        audio = np.zeros(3200, dtype=np.float32)
        audio[:800] = 0.5  # Loud
        audio[1600:] = 0.001  # Very quiet

        effect = EffectConfig(effect_type="noise_gate", enabled=True, params={"threshold": 0.01})
        result = apply_effect(audio, 16000, effect)
        # Quiet region should be silenced
        assert np.max(np.abs(result[2400:])) < 0.001

    def test_time_stretch_changes_duration(self):
        audio = _tone(duration=0.2)
        effect = EffectConfig(effect_type="time_stretch", enabled=True, params={"factor": 1.5})
        result = apply_effect(audio, 16000, effect)
        # 1.5x stretch should make audio longer
        assert len(result) > len(audio)


# ---------------------------------------------------------------------------
# 3. Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_mono_audio(self):
        audio = _tone()
        chain = [EffectConfig(effect_type="compressor", enabled=True, params={})]
        result = apply_effects_chain(audio, 16000, chain)
        assert result.ndim == 1

    def test_different_sample_rates(self):
        audio_44k = np.sin(2 * np.pi * 440 * np.linspace(0, 0.1, 4410, dtype=np.float32))
        chain = [EffectConfig(effect_type="compressor", enabled=True, params={})]
        result = apply_effects_chain(audio_44k, 44100, chain)
        assert len(result) == len(audio_44k)

    def test_very_short_audio(self):
        audio = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        chain = [EffectConfig(effect_type="compressor", enabled=True, params={})]
        result = apply_effects_chain(audio, 16000, chain)
        assert len(result) == 3

    def test_silent_audio_through_effects(self):
        audio = _silence()
        chain = [
            EffectConfig(effect_type="distortion", enabled=True, params={"drive": 5.0}),
            EffectConfig(effect_type="reverb", enabled=True, params={"room_size": 0.5}),
        ]
        result = apply_effects_chain(audio, 16000, chain)
        # Silent input should remain silent (or near-silent)
        assert np.max(np.abs(result)) < 0.01


# ---------------------------------------------------------------------------
# 4. Trim region tests
# ---------------------------------------------------------------------------


class TestTrimRegion:
    """Effects should only modify the trimmed [start_ms, end_ms] region,
    leaving the rest of the audio untouched."""

    def test_trim_start_only_changes_region_after_start(self):
        sr = 16000
        # 1 second of silence with a loud tone at the very end
        audio = _silence(duration=1.0, sr=sr)
        audio[-sr // 10:] = 0.5  # loud tone in last 100ms
        chain = [
            EffectConfig(
                effect_type="distortion",
                enabled=True,
                params={"gain": 10.0, "mix": 1.0},
                trim_start_ms=500.0,
            )
        ]
        result = apply_effects_chain(audio, sr, chain)
        # First half should be untouched (still silence)
        assert np.max(np.abs(result[: sr // 2])) < 1e-6
        # Region after trim_start should have the tone distorted
        assert np.max(np.abs(result[sr // 2 :])) > 0.1

    def test_trim_end_only_changes_region_before_end(self):
        sr = 16000
        audio = _silence(duration=1.0, sr=sr)
        audio[: sr // 10] = 0.5  # loud tone in first 100ms
        chain = [
            EffectConfig(
                effect_type="distortion",
                enabled=True,
                params={"gain": 10.0, "mix": 1.0},
                trim_end_ms=500.0,
            )
        ]
        result = apply_effects_chain(audio, sr, chain)
        # Region before trim_end should have the tone distorted
        assert np.max(np.abs(result[: sr // 2])) > 0.1
        # After trim_end should be untouched (still silence)
        assert np.max(np.abs(result[sr // 2 :])) < 1e-6

    def test_trim_both_changes_only_middle_region(self):
        sr = 16000
        audio = np.ones(sr, dtype=np.float32) * 0.5  # constant 0.5 everywhere
        chain = [
            EffectConfig(
                effect_type="distortion",
                enabled=True,
                params={"gain": 10.0, "mix": 1.0},
                trim_start_ms=250.0,
                trim_end_ms=750.0,
            )
        ]
        result = apply_effects_chain(audio, sr, chain)
        # Before trim_start: untouched (still 0.5)
        assert np.allclose(result[: int(0.24 * sr)], 0.5, atol=1e-3)
        # Middle region: distorted (not 0.5 anymore)
        assert not np.allclose(result[int(0.3 * sr) : int(0.7 * sr)], 0.5, atol=1e-3)
        # After trim_end: untouched (still 0.5)
        assert np.allclose(result[int(0.76 * sr) :], 0.5, atol=1e-3)

    def test_trim_zero_means_entire_audio(self):
        sr = 16000
        audio = np.ones(sr, dtype=np.float32) * 0.5
        chain = [
            EffectConfig(
                effect_type="distortion",
                enabled=True,
                params={"gain": 10.0, "mix": 1.0},
                trim_start_ms=0.0,
                trim_end_ms=0.0,
            )
        ]
        result = apply_effects_chain(audio, sr, chain)
        # No trim — entire audio should be distorted (not 0.5 anymore)
        assert not np.allclose(result, 0.5, atol=1e-3)

    def test_trim_disabled_effect_not_applied(self):
        sr = 16000
        audio = np.ones(sr, dtype=np.float32) * 0.5
        chain = [
            EffectConfig(
                effect_type="distortion",
                enabled=False,
                params={"gain": 10.0, "mix": 1.0},
                trim_start_ms=250.0,
                trim_end_ms=750.0,
            )
        ]
        result = apply_effects_chain(audio, sr, chain)
        # Disabled effect — audio unchanged everywhere
        np.testing.assert_array_equal(result, audio)

    def test_trim_region_preserves_duration(self):
        sr = 16000
        audio = _tone(duration=0.5, sr=sr)
        chain = [
            EffectConfig(
                effect_type="distortion",
                enabled=True,
                params={"gain": 10.0, "mix": 1.0},
                trim_start_ms=100.0,
                trim_end_ms=400.0,
            )
        ]
        result = apply_effects_chain(audio, sr, chain)
        assert len(result) == len(audio)
