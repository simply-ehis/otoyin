"""Offline DSP / synthesizer service (pre-AI synthesis, no models, no network).

Wraps the `audio-dsp` library (MIT) plus a few small NumPy DSP helpers for
effects the library does not expose as a single call (convolution reverb,
ring modulation). Every function returns a float32 ndarray at the given
sample rate. This is the "Synth / DSP" tab's backend brain.

All synthesis here is classical DSP: oscillators, FM, subtractive, Karplus-
Strong, chip-tone, dial-up. Zero AI, zero API. See worksheets/dsp-synth-plan.md.
"""

from __future__ import annotations

import contextlib
import logging
import os
import shutil
import tempfile

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

SR = 44100

# ---------------------------------------------------------------------------
# Lazy audio-dsp imports — the library is optional and must not crash the
# backend at startup.  Each synth/effect function imports what it needs on
# demand.  ``is_dsp_available()`` provides a single gate for health checks
# and endpoint-level 501 responses.
# ---------------------------------------------------------------------------

_audio_dsp_available: bool | None = None


def is_dsp_available() -> bool:
    """Return True if the ``audio_dsp`` package is importable."""
    global _audio_dsp_available
    if _audio_dsp_available is not None:
        return _audio_dsp_available
    try:
        import audio_dsp  # noqa: F401

        _audio_dsp_available = True
    except ImportError:
        _audio_dsp_available = False
        logger.debug("audio-dsp not installed — DSP synth/effects unavailable")
    return _audio_dsp_available


def _require_dsp() -> None:
    """Raise a clear error if audio-dsp is not installed."""
    if not is_dsp_available():
        raise ImportError(
            "The 'audio-dsp' package is required for DSP synthesis and effects. Install it with: pip install audio-dsp"
        )


def _audio_dsp_import_dir_factory() -> str:
    """Create a throwaway working directory for audio-dsp imports.

    audio-dsp 0.1.10 executes demo code at import time with CWD-relative
    output paths (utils/arpeggio.py renders "arpeggio.wav",
    synth/chip_tone.py renders "8bit_samples.wav"). Importing it from the
    repo root therefore drops stray WAVs into the tree. We chdir to a temp
    folder so those side effects land there instead.
    """
    return tempfile.mkdtemp(prefix="audio-dsp-import-")


def _clip(a: np.ndarray) -> np.ndarray:
    return np.nan_to_num(np.clip(a, -1.0, 1.0), nan=0.0, posinf=1.0, neginf=-1.0).astype(np.float32)


def _to_float(a) -> np.ndarray:
    a = np.asarray(a, dtype=object)
    if a.dtype == object:
        # audio-dsp sometimes returns (left, right) tuples or jagged arrays
        if isinstance(a.item(0) if a.size else None, (list, tuple, np.ndarray)):
            a = np.concatenate([np.asarray(x, dtype=np.float32).reshape(-1) for x in a])
        else:
            a = np.asarray(a, dtype=np.float32)
    if a.ndim > 1:
        a = a.mean(axis=1) if a.shape[0] <= a.shape[-1] else a.mean(axis=0)
    if a.dtype == np.int16:
        a = a.astype(np.float32) / 32767.0
    return _clip(a.astype(np.float32))


def _tmp_wav(audio: np.ndarray) -> str:
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    sf.write(path, np.asarray(audio, dtype=np.float32), SR, format="WAV")
    return path


# ── Synthesizers ────────────────────────────────────────────────────────────


def synth_subtractive(
    freq: float = 220.0,
    duration: float = 1.0,
    wave: str = "saw",
    cutoff: float = 1200.0,
    resonance: float = 1.5,
    attack: float = 0.02,
    decay: float = 0.1,
    sustain: float = 0.7,
    release: float = 0.2,
) -> np.ndarray:
    """Subtractive synth: rich oscillator -> resonant filter -> ADSR. Robot/beep source."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.synth import subtractive_synth
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    s = subtractive_synth.SubtractiveSynth(sample_rate=SR)
    s.osc_wave = wave
    s.filter_cutoff = cutoff
    s.filter_resonance = resonance
    audio = s.synthesize(freq, duration, attack, decay, sustain, release)
    return _to_float(audio)


def synth_fm(
    freq: float = 220.0,
    duration: float = 1.0,
    algorithm: int = 1,
) -> np.ndarray:
    """DX7-style 4-operator FM synthesis. Bells, electric pianos, sci-fi timbres."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.synth.dx7_fm_synth import DX7FMSynth
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    synth = DX7FMSynth(sample_rate=SR)
    audio = synth.synthesize(freq, duration, algorithm)
    return _to_float(audio)


def synth_drum(kind: str = "kick", length: float = 0.4) -> np.ndarray:
    """Synthesized drum hit (kick/snare/hihat/clap/tom/cymbal)."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.synth import drum_synth
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    drum = drum_synth.DrumSynth(sample_rate=SR)
    fn = {
        "kick": drum.kick,
        "snare": drum.snare,
        "hihat": drum.cymbal,
        "clap": drum.clap,
        "tom": drum.tom,
        "cymbal": drum.cymbal,
    }.get(kind, drum.kick)
    audio = fn(length=length)
    return _to_float(audio)


def synth_chiptone(note: str = "C4", duration: float = 0.3) -> np.ndarray:
    """8-bit retro chip blip at a named note (deterministic square wave)."""
    semitones = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    name = note[0].upper() + (note[1] if len(note) > 1 and note[1] == "#" else "")
    octave = int(note[-1]) if note[-1].isdigit() else 4
    midi = 12 * (octave + 1) + semitones.get(name, 0)
    freq = 440.0 * 2 ** ((midi - 69) / 12.0)
    t = np.arange(int(SR * duration)) / SR
    audio = np.sign(np.sin(2 * np.pi * freq * t)).astype(np.float32)
    env = np.clip(np.linspace(0.0, 1.0, int(SR * 0.005)), 0, 1)
    audio[: len(env)] *= env
    audio[-len(env) :] *= env[::-1]
    return _clip(audio)


def synth_pluck(freq: float = 196.0, duration: float = 1.0) -> np.ndarray:
    """Karplus-Strong plucked string (returns the synthesized buffer)."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.synth import pluck
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    path = _tmp_wav(np.zeros(1, dtype=np.float32))
    pluck.generate_string_pluck(output_file=path, length=duration, frequency=freq)
    audio, _ = sf.read(path)
    with contextlib.suppress(OSError):
        os.remove(path)
    return _to_float(audio)


def synth_dialup(duration: float = 2.0) -> np.ndarray:
    """56k modem / dial-up handshake. Pure nostalgia, pure math."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.synth import dialup_synth
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    path = _tmp_wav(np.zeros(1, dtype=np.float32))
    dialup_synth.generate_56k_dialup(filename=path, duration=duration, sample_rate=SR)
    audio, _ = sf.read(path)
    with contextlib.suppress(OSError):
        os.remove(path)
    return _to_float(audio)


def synth_robot_speech(duration: float = 1.2) -> np.ndarray:
    """Robotic synthesized speech-like babble (formant synthesis, no TTS model)."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.synth import speech
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    audio = speech.generate_default()
    audio = _to_float(audio)
    if duration != len(audio) / SR:
        n = int(SR * duration)
        if n < len(audio):
            audio = audio[:n]
        else:
            audio = np.concatenate([audio, np.zeros(n - len(audio), dtype=np.float32)])
    return audio


# ── Effects (apply to an existing float32 signal) ───────────────────────────


def effect_vocoder(signal: np.ndarray, sr: int, carrier_freq: float = 120.0) -> np.ndarray:
    """Vocoder: impose signal's envelope onto a buzzy carrier -> robot voice."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import vocoder
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    n = len(signal)
    t = np.arange(n) / sr
    carrier = np.sin(2 * np.pi * carrier_freq * t).astype(np.float32)
    out = vocoder(carrier, signal.astype(np.float32), sr=sr, carrier_type="sine", carrier_freq=carrier_freq)
    return _to_float(out)


def effect_bitcrush(signal: np.ndarray, bits: int = 8, gain: float = 1.0) -> np.ndarray:
    """Bitcrush: reduce bit depth for lo-fi / 8-bit character."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import bitcrush_distortion
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    bits = int(min(max(int(bits), 1), 16))
    out = bitcrush_distortion(signal.astype(np.float32), gain=gain, bits=bits, mix=1.0)
    return _to_float(out)


def effect_distortion(signal: np.ndarray, kind: str = "fuzz", drive: float = 3.0) -> np.ndarray:
    """Distortion types from audio-dsp (fuzz, hard_clip, wavefold, chebyshev, ...)."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import distortion as distortion_mod
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    fn = getattr(distortion_mod, f"{kind}_distortion", None) or distortion_mod.fuzz_distortion
    out = fn(signal.astype(np.float32), gain=drive)
    return _to_float(out)


def effect_tape(signal: np.ndarray, sr: int, drive: float = 2.0, warmth: float = 0.1) -> np.ndarray:
    """Tape saturation: warm analog-style harmonics."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import tape_saturation
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    out = tape_saturation(signal.astype(np.float32), sample_rate=sr, drive=drive, warmth=warmth)
    return _to_float(out)


def effect_filter(signal: np.ndarray, sr: int, cutoff: float = 1500.0, ftype: str = "lowpass") -> np.ndarray:
    """Resonant filter (lowpass/highpass/bandpass)."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import filter_effect
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    out = filter_effect(signal.astype(np.float32), sample_rate=sr, cutoff=cutoff, filter_type=ftype)
    return _to_float(out)


def effect_delay(signal: np.ndarray, sr: int, time: float = 0.25, feedback: float = 0.5) -> np.ndarray:
    """Delay/echo with feedback."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import delay
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    out = delay(signal.astype(np.float32), sample_rate=sr, delay_time=time, feedback=feedback)
    return _to_float(out)


def effect_phaser(signal: np.ndarray, sr: int, rate: float = 0.5, depth: float = 0.8) -> np.ndarray:
    """Phaser/flanger modulation."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import phaser_flanger
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    out = phaser_flanger(signal.astype(np.float32), sample_rate=sr, phaser_rate=rate, phaser_depth=depth)
    return _to_float(out)


def effect_pitch(signal: np.ndarray, sr: int, drift_depth: float = 0.1, rate: float = 0.05) -> np.ndarray:
    """Pitch drift / wobble (the "raise/lower audio pitch" control)."""
    _require_dsp()
    d = _audio_dsp_import_dir_factory()
    prev_cwd = os.getcwd()
    os.chdir(d)
    try:
        from audio_dsp.effects import pitch_drift
    finally:
        os.chdir(prev_cwd)
        with contextlib.suppress(OSError):
            shutil.rmtree(d, ignore_errors=True)
    out = pitch_drift(signal.astype(np.float32), sample_rate=sr, drift_depth=drift_depth, drift_rate=rate)
    return _to_float(out)


def effect_ringmod(signal: np.ndarray, sr: int, mod_freq: float = 100.0) -> np.ndarray:
    """Ring modulation: multiply signal by a sine -> metallic, Dalek-like timbre."""
    t = np.arange(len(signal)) / sr
    mod = np.sin(2 * np.pi * mod_freq * t).astype(np.float32)
    return _clip(signal.astype(np.float32) * mod)


def effect_reverb(signal: np.ndarray, sr: int, decay: float = 1.2, wet: float = 0.3) -> np.ndarray:
    """Convolution reverb with a synthesized exponential-noise impulse response."""
    from numpy.fft import fft, ifft

    n = int(sr * decay)
    ir = np.random.RandomState(0).randn(n).astype(np.float32)
    env = np.linspace(1.0, 0.0, n, dtype=np.float32)
    ir = ir * env
    a = signal.astype(np.float32)
    fft_len = 1 << int(np.ceil(np.log2(len(a) + n)))
    fa = fft(a, fft_len)
    fir = fft(np.concatenate([ir, np.zeros(fft_len - n)]))
    verb = np.real(ifft(fa * fir)[: len(a)]).astype(np.float32)
    return _clip(a * (1 - wet) + verb * wet)


def robotize(signal: np.ndarray, sr: int, carrier_freq: float = 120.0, bits: int = 8) -> np.ndarray:
    """Convenience preset: vocoder + bitcrush + lowpass = classic robot voice."""
    s = effect_vocoder(signal, sr, carrier_freq=carrier_freq)
    s = effect_bitcrush(s, bits=bits)
    s = effect_filter(s, sr, cutoff=2000.0, ftype="lowpass")
    return s
