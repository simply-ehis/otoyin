"""Procedural instruments and noise generator for 21labs.

All sounds are generated algorithmically — no sample playback.
"""

import numpy as np


def generate_piano_note(
    note: int,
    duration: float = 1.0,
    velocity: float = 0.8,
    sample_rate: int = 48000,
) -> np.ndarray:
    """Generate a piano-like note using additive synthesis."""
    freq = 440.0 * (2.0 ** ((note - 69) / 12.0))
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    harmonics = [1.0, 0.5, 0.25, 0.125, 0.0625]
    audio = np.zeros_like(t)
    for i, h in enumerate(harmonics):
        audio += h * np.sin(2 * np.pi * freq * (i + 1) * t)
    attack = int(0.01 * sample_rate)
    decay = int(0.1 * sample_rate)
    release = int(0.3 * sample_rate)
    envelope = np.ones_like(t)
    if attack > 0:
        envelope[:attack] = np.linspace(0, 1, attack)
    sustain_level = 0.6
    if attack + decay < len(t):
        envelope[attack : attack + decay] = np.linspace(1, sustain_level, decay)
    if release < len(t):
        envelope[-release:] = np.linspace(sustain_level, 0, release)
    audio *= envelope * velocity
    return audio.astype(np.float32)


def generate_drum_pad(
    drum_type: str = "kick",
    duration: float = 0.5,
    velocity: float = 0.8,
    sample_rate: int = 48000,
) -> np.ndarray:
    """Generate drum sounds using synthesis."""
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    if drum_type == "kick":
        freq_sweep = 150 * np.exp(-t * 30) + 40
        phase = np.cumsum(freq_sweep / sample_rate) * 2 * np.pi
        audio = np.sin(phase) * np.exp(-t * 8)
    elif drum_type == "snare":
        tone = np.sin(2 * np.pi * 200 * t) * np.exp(-t * 20)
        noise = np.random.randn(n) * np.exp(-t * 15)
        audio = tone * 0.3 + noise * 0.7
    elif drum_type == "hihat":
        audio = np.random.randn(n) * np.exp(-t * 40)
        audio = audio * 0.5
    elif drum_type == "clap":
        env = np.exp(-t * 10)
        noise = np.random.randn(n) * env
        offsets = [0, 0.01, 0.02]
        result = np.zeros(n)
        for offset in offsets:
            idx = int(offset * sample_rate)
            result[idx:] += noise[: n - idx] * 0.3
        audio = result
    elif drum_type == "tom":
        freq = 100 * np.exp(-t * 5)
        phase = np.cumsum(freq / sample_rate) * 2 * np.pi
        audio = np.sin(phase) * np.exp(-t * 6)
    else:
        audio = np.random.randn(n) * np.exp(-t * 10)
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * velocity
    return audio.astype(np.float32)


def generate_synth_note(
    note: int,
    duration: float = 1.0,
    waveform: str = "sawtooth",
    filter_cutoff: float = 0.5,
    resonance: float = 0.0,
    velocity: float = 0.8,
    sample_rate: int = 48000,
) -> np.ndarray:
    """Generate a synth note with various waveforms."""
    freq = 440.0 * (2.0 ** ((note - 69) / 12.0))
    n = int(sample_rate * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    if waveform == "sine":
        audio = np.sin(2 * np.pi * freq * t)
    elif waveform == "square":
        audio = np.sign(np.sin(2 * np.pi * freq * t))
    elif waveform == "sawtooth":
        audio = 2 * (freq * t % 1) - 1
    elif waveform == "triangle":
        audio = 2 * np.abs(2 * (freq * t % 1) - 1) - 1
    else:
        audio = np.sin(2 * np.pi * freq * t)
    attack = int(0.02 * sample_rate)
    release = int(0.1 * sample_rate)
    envelope = np.ones(n)
    if attack > 0:
        envelope[:attack] = np.linspace(0, 1, attack)
    if release < n:
        envelope[-release:] = np.linspace(1, 0, release)
    audio *= envelope * velocity
    return audio.astype(np.float32)


# Noise generator algorithms
NOISE_TYPES = {
    "white": "Equal energy at all frequencies",
    "pink": "1/f spectrum, natural sound",
    "brown": "1/f^2, deep rumble",
    "blue": "f spectrum, bright hiss",
    "violet": "f^2, very bright",
}


def generate_noise(
    noise_type: str = "white",
    duration: float = 1.0,
    amplitude: float = 0.5,
    sample_rate: int = 48000,
) -> np.ndarray:
    """Generate procedural noise — pure algorithms, no samples."""
    n = int(sample_rate * duration)
    if noise_type == "white":
        audio = np.random.randn(n)
    elif noise_type == "pink":
        audio = _generate_pink_noise(n)
    elif noise_type == "brown":
        audio = _generate_brown_noise(n)
    elif noise_type == "blue":
        audio = _generate_colored_noise(n, exponent=1.0)
    elif noise_type == "violet":
        audio = _generate_colored_noise(n, exponent=2.0)
    else:
        audio = np.random.randn(n)
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * amplitude
    return audio.astype(np.float32)


def _generate_pink_noise(n: int) -> np.ndarray:
    """Generate pink noise using Voss-McCartney algorithm."""
    rows = 16
    cols = n
    array = np.random.randn(rows, cols)
    cumsum = np.cumsum(array, axis=0)
    pink = np.sum(cumsum, axis=0) / rows
    return pink


def _generate_brown_noise(n: int) -> np.ndarray:
    """Generate brown noise (random walk)."""
    audio = np.cumsum(np.random.randn(n))
    audio = audio / np.abs(audio).max() if np.abs(audio).max() > 0 else audio
    return audio


def _generate_colored_noise(n: int, exponent: float = 1.0) -> np.ndarray:
    """Generate colored noise using FFT filtering."""
    white = np.random.randn(n)
    fft = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n)
    freqs[0] = 1.0
    fft *= freqs**exponent
    return np.fft.irfft(fft, n=n)
