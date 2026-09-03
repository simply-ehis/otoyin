"""Emotion/Tone post-processing for audio.

Adjusts warmth, energy, brightness, and formant without changing pitch.
All parameters range from -1.0 to +1.0 (0 = no change).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import sosfilt


def _db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


def _shelf_filter(
    audio: np.ndarray,
    sample_rate: int,
    cutoff: float,
    gain_db: float,
    shelf_type: str = "low",
) -> np.ndarray:
    """Apply a first-order shelf filter via biquad."""
    gain_linear = _db_to_linear(gain_db)
    w0 = 2.0 * np.pi * cutoff / sample_rate
    alpha = np.sin(w0) / 2.0 * np.sqrt((gain_linear + 1.0 / gain_linear) * (1.0 / 0.707 - 1.0) + 2.0)

    if shelf_type == "low":
        b0 = gain_linear * ((gain_linear + 1.0) - (gain_linear - 1.0) * np.cos(w0) + 2.0 * np.sqrt(gain_linear) * alpha)
        b1 = 2.0 * gain_linear * ((gain_linear - 1.0) - (gain_linear + 1.0) * np.cos(w0))
        b2 = gain_linear * ((gain_linear + 1.0) - (gain_linear - 1.0) * np.cos(w0) - 2.0 * np.sqrt(gain_linear) * alpha)
        a0 = (gain_linear + 1.0) + (gain_linear - 1.0) * np.cos(w0) + 2.0 * np.sqrt(gain_linear) * alpha
        a1 = -2.0 * ((gain_linear - 1.0) + (gain_linear + 1.0) * np.cos(w0))
        a2 = (gain_linear + 1.0) + (gain_linear - 1.0) * np.cos(w0) - 2.0 * np.sqrt(gain_linear) * alpha
    else:
        b0 = gain_linear * ((gain_linear + 1.0) + (gain_linear - 1.0) * np.cos(w0) + 2.0 * np.sqrt(gain_linear) * alpha)
        b1 = -2.0 * gain_linear * ((gain_linear - 1.0) + (gain_linear + 1.0) * np.cos(w0))
        b2 = gain_linear * ((gain_linear + 1.0) + (gain_linear - 1.0) * np.cos(w0) - 2.0 * np.sqrt(gain_linear) * alpha)
        a0 = (gain_linear + 1.0) - (gain_linear - 1.0) * np.cos(w0) + 2.0 * np.sqrt(gain_linear) * alpha
        a1 = 2.0 * ((gain_linear - 1.0) - (gain_linear + 1.0) * np.cos(w0))
        a2 = (gain_linear + 1.0) - (gain_linear - 1.0) * np.cos(w0) - 2.0 * np.sqrt(gain_linear) * alpha

    sos = np.array([[b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0]])
    return sosfilt(sos, audio).astype(np.float32)


def _soft_clip(audio: np.ndarray, drive: float = 1.0) -> np.ndarray:
    """Gentle saturation via tanh soft-clipping."""
    if drive <= 0.0:
        return audio
    return np.tanh(audio * (1.0 + drive * 2.0)).astype(np.float32)


def _transient_shaper(audio: np.ndarray, sample_rate: int, amount: float) -> np.ndarray:
    """Emphasize or soften transients (attack portion of sound).

    Uses a simple envelope follower with fast attack / slow release.
    ``amount`` > 0 boosts transients; < 0 reduces them.
    """
    if abs(amount) < 0.01:
        return audio

    n = len(audio)
    attack_ms = 5.0
    release_ms = 50.0
    attack_coeff = np.exp(-1.0 / (sample_rate * attack_ms / 1000.0))
    release_coeff = np.exp(-1.0 / (sample_rate * release_ms / 1000.0))

    envelope = np.zeros(n, dtype=np.float64)
    env = 0.0
    for i in range(n):
        level = abs(float(audio[i]))
        if level > env:
            env = attack_coeff * env + (1.0 - attack_coeff) * level
        else:
            env = release_coeff * env + (1.0 - release_coeff) * level
        envelope[i] = env

    # Transient = difference between signal and smoothed envelope
    transient = np.abs(audio.astype(np.float64)) - envelope
    transient = np.clip(transient, 0.0, None)

    # Scale transients
    gain = 1.0 + amount * transient / (envelope + 1e-8)
    gain = np.clip(gain, 0.1, 3.0).astype(np.float32)

    return (audio * gain).astype(np.float32)


def _formant_shift(audio: np.ndarray, sample_rate: int, shift: float) -> np.ndarray:
    """Shift vocal formants via FFT frequency-axis scaling.

    ``shift`` ranges from -1.0 (deeper/darker) to +1.0 (brighter/thinner).
    0 = no change. Maps to a shift_factor of 0.7..1.3.
    """
    if abs(shift) < 0.01:
        return audio

    shift_factor = 1.0 + shift * 0.3
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    shifted_freqs = freqs * shift_factor
    mag = np.abs(fft)
    phase = np.angle(fft)
    new_mag = np.interp(freqs, shifted_freqs, mag, left=0.0, right=0.0)
    new_phase = np.interp(freqs, shifted_freqs, phase, left=0.0, right=0.0)
    new_spectrum = new_mag * np.exp(1j * new_phase)
    return np.fft.irfft(new_spectrum, n=n).astype(np.float32)


def apply_emotion_tone(
    audio: np.ndarray,
    sample_rate: int,
    warmth: float = 0.0,
    energy: float = 0.0,
    brightness: float = 0.0,
    formant: float = 0.0,
) -> np.ndarray:
    """Apply emotion/tone post-processing to audio.

    All parameters range from -1.0 to +1.0:
      - warmth: low-shelf boost (+) / cut (-) around 200-500 Hz
      - energy: compression + transient shaping
      - brightness: high-shelf boost (+) / cut (-) above 3 kHz
      - formant: vocal formant shift (deeper <-> thinner)
    """
    result = audio.copy()

    # 1. Warmth — low-shelf EQ + subtle saturation
    if abs(warmth) > 0.01:
        warmth_db = warmth * 6.0  # max ±6 dB
        result = _shelf_filter(result, sample_rate, 400.0, warmth_db, "low")
        if warmth > 0:
            result = _soft_clip(result, warmth * 0.15)

    # 2. Brightness — high-shelf EQ
    if abs(brightness) > 0.01:
        brightness_db = brightness * 5.0  # max ±5 dB
        result = _shelf_filter(result, sample_rate, 3000.0, brightness_db, "high")

    # 3. Energy — compression + transient shaping
    if abs(energy) > 0.01:
        # Gentle compression
        threshold_db = -20.0 - energy * 10.0
        ratio = 2.0 + abs(energy) * 4.0
        threshold_linear = 10.0 ** (threshold_db / 20.0)
        attack_samples = int(sample_rate * 0.01)
        release_samples = int(sample_rate * 0.1)

        envelope = np.zeros_like(result, dtype=np.float64)
        env = 0.0
        for i in range(len(result)):
            level = abs(float(result[i]))
            if level > env:
                env = env + (level - env) / max(attack_samples, 1)
            else:
                env = env + (level - env) / max(release_samples, 1)
            envelope[i] = env

        gain = np.ones_like(result, dtype=np.float64)
        compressed = envelope > threshold_linear
        gain[compressed] = threshold_linear / (envelope[compressed] + 1e-10)
        gain[compressed] = gain[compressed] + (1.0 - gain[compressed]) / ratio
        result = (result * gain).astype(np.float32)

        # Transient emphasis
        result = _transient_shaper(result, sample_rate, energy * 0.5)

    # 4. Formant shift
    if abs(formant) > 0.01:
        result = _formant_shift(result, sample_rate, formant)

    return np.clip(result, -1.0, 1.0).astype(np.float32)
