"""Voice effects chain processor with all advanced effects."""

import json
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy.orm import Session

from ..database.models import EffectPreset as DBEffectPreset
from .effects_extended import (
    apply_age_shift,
    apply_auto_tune,
    apply_deesser,
    apply_gender_swap,
    apply_helium,
    apply_megaphone,
    apply_multi_band_pitch,
    apply_multi_mic_phase,
    apply_resonant_filter_sweep,
    apply_smart_crossfade,
    apply_spectral_denoise,
    apply_spectral_duck,
    apply_spectral_repair,
    apply_telephone,
    apply_underwater,
    apply_vocoder,
    apply_whisper_transform,
)


@dataclass
class EffectConfig:
    effect_type: str
    enabled: bool = True
    params: dict = field(default_factory=dict)


def apply_effects_chain(audio: np.ndarray, sample_rate: int, chain: list[EffectConfig]) -> np.ndarray:
    result = audio.copy()
    for effect in chain:
        if not effect.enabled:
            continue
        result = apply_effect(result, sample_rate, effect)
    return result


def apply_effect(audio: np.ndarray, sample_rate: int, effect: EffectConfig) -> np.ndarray:
    handlers = {
        "pitch_shift": apply_pitch_shift,
        "formant_shift": apply_formant_shift,
        "time_stretch": apply_time_stretch,
        "reverb": apply_reverb,
        "delay": apply_delay,
        "chorus": apply_chorus,
        "distortion": apply_distortion,
        "eq": apply_eq,
        "compressor": apply_compressor,
        "noise_gate": apply_noise_gate,
        "gender_swap": apply_gender_swap,
        "age_shift": apply_age_shift,
        "helium": apply_helium,
        "vocoder": apply_vocoder,
        "telephone": apply_telephone,
        "megaphone": apply_megaphone,
        "underwater": apply_underwater,
        "whisper_transform": apply_whisper_transform,
        "auto_tune": apply_auto_tune,
        "spectral_duck": apply_spectral_duck,
        "multi_band_pitch": apply_multi_band_pitch,
        "resonant_filter_sweep": apply_resonant_filter_sweep,
        "spectral_repair": apply_spectral_repair,
        "multi_mic_phase": apply_multi_mic_phase,
        "smart_crossfade": apply_smart_crossfade,
        "deesser": apply_deesser,
        "spectral_denoise": apply_spectral_denoise,
        "emotion_tone": apply_emotion_tone_effect,
    }
    handler = handlers.get(effect.effect_type)
    if handler:
        return handler(audio, sample_rate, effect.params)
    raise ValueError(f"Unknown effect: {effect.effect_type}")


def _phase_vocoder(audio: np.ndarray, factor: float) -> np.ndarray:
    """Pitch-preserving time stretch via a vectorised phase vocoder (overlap-add).

    ``factor`` > 1 lengthens the audio while keeping pitch; < 1 shortens it.

    The analysis windowing, FFT, magnitude/phase extraction, and synthesis
    IFFT are all performed as single batched numpy operations on a 2-D
    (n_frames x frame) array, eliminating per-frame Python overhead for
    those expensive steps.  The phase-accumulator IIR and the overlap-add
    scatter-write remain sequential (they are inherently serial / scatter-
    based) but are lightweight arithmetic.
    """
    audio = np.ascontiguousarray(audio, dtype=np.float64)
    n = audio.shape[0]
    if n < 2 or abs(factor - 1.0) < 1e-6:
        return audio.astype(np.float32)

    frame = 256
    overlap = 0.75
    hop_a = max(1, round(frame * (1 - overlap)))
    hop_s = max(1, round(hop_a * factor))
    win = np.hanning(frame)
    half_frame = frame // 2
    n_frames = 1 + max(0, (n - frame) // hop_a)
    if n_frames < 1:
        return audio.astype(np.float32)

    # ---- 1. Batch-extract all analysis frames and window them at once ----
    # offsets[i] is the sample index where frame *i* starts.
    offsets = np.arange(n_frames, dtype=np.intp) * hop_a
    # Pad audio so the last frame is complete.
    needed = offsets[-1] + frame
    if needed > n:
        audio = np.pad(audio, (0, needed - n))

    # Fancy-index the full (n_frames, frame) matrix in one shot.
    idx = offsets[:, None] + np.arange(frame, dtype=np.intp)  # (n_frames, frame)
    frames = audio[idx] * win  # windowed frames

    # ---- 2. Batch FFT (numpy applies rfft along axis=1 for 2-D input) ----
    specs = np.fft.rfft(frames, axis=1)  # (n_frames, half_frame+1) complex
    mags = np.abs(specs)
    phases = np.angle(specs)
    del specs  # free early

    # ---- 3. Phase-unwrapping IIR (sequential — depends on prev frame) ----
    expected = 2 * np.pi * hop_a * np.fft.rfftfreq(frame)
    sum_phase = np.zeros(half_frame + 1, dtype=np.float64)
    prev_phase = np.zeros(half_frame + 1, dtype=np.float64)
    # Pre-allocate synthesis magnitudes (complex); fill in the loop.
    synth_mags = np.empty((n_frames, half_frame + 1), dtype=np.complex128)

    two_pi = 2.0 * np.pi
    for i in range(n_frames):
        delta = phases[i] - prev_phase - expected
        delta -= two_pi * np.round(delta / two_pi)
        sum_phase += expected + delta
        prev_phase = phases[i]
        synth_mags[i] = mags[i] * np.exp(1j * sum_phase)
    del mags, phases  # free early

    # ---- 4. Batch IFFT ----
    synths = np.fft.irfft(synth_mags, axis=1)  # (n_frames, frame)
    del synth_mags
    # Window the synthesised frames.
    synths *= win  # broadcasting: (n_frames, frame) * (frame,)

    # ---- 5. Overlap-add into output buffer ----
    # This is a scatter-write pattern (each frame targets a different offset)
    # so it stays sequential, but the body is just array addition.
    out_len = frame + (n_frames - 1) * hop_s
    out = np.zeros(out_len, dtype=np.float64)
    denom = np.zeros(out_len, dtype=np.float64)
    win_sq = win * win
    synth_offsets = offsets * (hop_s / hop_a)  # synthesis hop may differ
    synth_offsets = synth_offsets.astype(np.intp)

    for i in range(n_frames):
        s = synth_offsets[i]
        out[s : s + frame] += synths[i]
        denom[s : s + frame] += win_sq

    denom[denom < 1e-8] = 1.0
    out /= denom
    target = max(1, round(n * factor))
    return out[:target].astype(np.float32)


def apply_pitch_shift(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    semitones = params.get("semitones", 0.0)
    if semitones == 0.0:
        return audio
    ratio = 2.0 ** (semitones / 12.0)
    n = len(audio)
    # For pitch UP (ratio > 1): vocoder lengthens, resample back to n → pitch rises
    # For pitch DOWN (ratio < 1): use 1/ratio so vocoder lengthens, resample back → pitch falls
    stretch_ratio = ratio if ratio > 1.0 else 1.0 / ratio
    stretched = _phase_vocoder(audio, stretch_ratio)
    if len(stretched) == n:
        return stretched
    indices = np.linspace(0, len(stretched) - 1, n)
    shifted = np.interp(indices, np.arange(len(stretched)), stretched)
    return shifted


def apply_formant_shift(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    shift_factor = params.get("shift_factor", 1.0)
    if shift_factor == 1.0:
        return audio
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.ones_like(freqs)
    for low, high in [(300, 1000), (1000, 3000), (3000, 8000)]:
        mask[(freqs >= low) & (freqs <= high)] = shift_factor
    fft *= mask
    return np.fft.irfft(fft, n=n).astype(np.float32)


def apply_time_stretch(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    factor = params.get("factor", 1.0)
    if factor == 1.0:
        return audio
    return _phase_vocoder(audio, factor)


def apply_reverb(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    room_size = params.get("room_size", 0.5)
    damping = params.get("damping", 0.5)
    wet = params.get("wet", 0.3)
    delays_ms = [29, 37, 41, 43, 53, 67]
    result = audio.copy()
    for delay_ms in delays_ms:
        delay_samples = int(delay_ms * sample_rate / 1000)
        delayed = np.zeros_like(audio)
        if delay_samples < len(audio):
            delayed[delay_samples:] = audio[:-delay_samples]
        result = result + delayed * room_size * (1 - damping)
    return audio * (1 - wet) + result * wet


def apply_delay(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    delay_ms = params.get("delay_ms", 200)
    feedback = params.get("feedback", 0.4)
    mix = params.get("mix", 0.3)
    delay_samples = int(delay_ms * sample_rate / 1000)
    result = audio.copy()
    for i in range(3):
        gain = feedback ** (i + 1)
        offset = delay_samples * (i + 1)
        if offset < len(audio):
            result[offset:] += audio[:-offset] * gain
    result = audio * (1 - mix) + result * mix
    return np.clip(result, -1.0, 1.0)


def apply_chorus(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    depth = params.get("depth", 0.002)
    rate = params.get("rate", 1.5)
    mix = params.get("mix", 0.5)
    n = len(audio)
    t = np.arange(n) / sample_rate
    mod = depth * sample_rate * np.sin(2 * np.pi * rate * t)
    indices = np.clip(np.arange(n) + mod, 0, n - 1).astype(int)
    return audio * (1 - mix) + audio[indices] * mix


def apply_distortion(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    gain = params.get("gain", 2.0)
    driven = np.tanh(audio * gain)
    mix = params.get("mix", 0.5)
    return audio * (1 - mix) + driven * mix


def apply_eq(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """4-band parametric EQ: lowshelf + 2 peaking + highshelf.

    Params: low_freq/low_gain/low_q, mid1_freq/mid1_gain/mid1_q,
            mid2_freq/mid2_gain/mid2_q, high_freq/high_gain/high_q.
    Legacy 3-band keys (low_gain/mid_gain/high_gain) are mapped as fallback.
    """
    bands = [
        ("low", "lowshelf", params.get("low_freq", 100), params.get("low_gain", 0), params.get("low_q", 0.707)),
        (
            "mid1",
            "peaking",
            params.get("mid1_freq", 1000),
            params.get("mid1_gain", params.get("mid_gain", 0)),
            params.get("mid1_q", 1.0),
        ),
        ("mid2", "peaking", params.get("mid2_freq", 3000), params.get("mid2_gain", 0), params.get("mid2_q", 1.0)),
        ("high", "highshelf", params.get("high_freq", 8000), params.get("high_gain", 0), params.get("high_q", 0.707)),
    ]
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.ones(len(fft), dtype=np.float64)
    for _name, btype, center, gain_db, q in bands:
        if gain_db == 0:
            continue
        center = max(20.0, min(center, sample_rate / 2 - 1))
        q = max(0.1, q)
        a = 10.0 ** (gain_db / 40.0)
        if btype == "peaking":
            ratio = freqs / center
            denom = 1.0 + q * q * (ratio - 1.0 / ratio) ** 2
            band_mask = 1.0 + (a * a - 1.0) / denom
        elif btype == "lowshelf":
            shelf_q = max(q, 0.707)
            ratio = freqs / center
            band_mask = np.where(
                freqs < center * 2,
                1.0 + (a * a - 1.0) / (1.0 + shelf_q * shelf_q * (ratio - 1.0 / ratio) ** 2),
                1.0,
            )
        else:  # highshelf
            shelf_q = max(q, 0.707)
            ratio = freqs / center
            band_mask = np.where(
                freqs > center / 2,
                1.0 + (a * a - 1.0) / (1.0 + shelf_q * shelf_q * (ratio - 1.0 / ratio) ** 2),
                1.0,
            )
        mask *= band_mask
    fft *= mask
    return np.fft.irfft(fft, n=n).astype(np.float32)


def apply_compressor(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    threshold = params.get("threshold", -20.0)
    ratio = params.get("ratio", 4.0)
    if not ratio or ratio < 1.0:
        raise ValueError(f"Compressor ratio must be >= 1.0, got {ratio!r}")
    attack = params.get("attack", 0.01)
    release = params.get("release", 0.1)
    threshold_linear = 10.0 ** (threshold / 20.0)
    attack_coeff = np.exp(-1.0 / max(attack * sample_rate, 1))
    release_coeff = np.exp(-1.0 / max(release * sample_rate, 1))

    # Vectorized envelope follower: split into attack/release segments
    # per-sample. For each sample, the envelope is computed as a weighted
    # running average of the previous envelope and the current level.
    # The coefficient is attack_coeff when level > envelope, else release_coeff.
    # This is a nonlinear IIR that requires sequential evaluation, but we
    # can vectorize the branching by pre-computing coefficients per sample.
    levels = np.abs(audio)
    levels_np = np.ascontiguousarray(levels, dtype=np.float64)
    envelope = np.empty(len(levels_np), dtype=np.float64)
    _compressor_envelope(levels_np, envelope, attack_coeff, release_coeff)
    envelope_f = envelope.astype(np.float32)

    gain = np.ones_like(audio)
    compressed = envelope_f > threshold_linear
    gain[compressed] = (threshold_linear / (envelope_f[compressed] + 1e-10)) ** (1.0 - 1.0 / ratio)
    return audio * gain


def _compressor_envelope(levels: np.ndarray, envelope: np.ndarray, attack_coeff: float, release_coeff: float) -> None:
    """Pure-numpy sequential envelope follower — writes into *envelope* in-place."""
    env = 0.0
    for i in range(len(levels)):
        lev = levels[i]
        coeff = attack_coeff if lev > env else release_coeff
        env = coeff * env + (1.0 - coeff) * lev
        envelope[i] = env


def apply_noise_gate(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    threshold = params.get("threshold", -40.0)
    threshold_linear = 10.0 ** (threshold / 20.0)
    frame_size = max(1, int(0.01 * sample_rate))
    n = len(audio)
    n_frames = (n + frame_size - 1) // frame_size
    # Pad audio to exact multiple of frame_size for reshape
    padded = np.zeros(n_frames * frame_size, dtype=audio.dtype)
    padded[:n] = audio
    frames = padded.reshape(n_frames, frame_size)
    frame_peaks = np.abs(frames).max(axis=1)
    # Create gate mask: 0 for silent frames, 1 for active frames
    gate = (frame_peaks >= threshold_linear).astype(audio.dtype)
    # Expand gate back to sample-level mask
    mask = np.repeat(gate, frame_size)[:n]
    return audio * mask


def apply_emotion_tone_effect(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply emotion/tone post-processing via the dedicated service."""
    from .emotion_tone import apply_emotion_tone

    return apply_emotion_tone(
        audio,
        sample_rate,
        warmth=float(params.get("warmth", 0.0)),
        energy=float(params.get("energy", 0.0)),
        brightness=float(params.get("brightness", 0.0)),
        formant=float(params.get("formant", 0.0)),
    )


EFFECT_TYPES = {
    "pitch_shift": {"name": "Pitch Shift", "params": {"semitones": {"min": -12, "max": 12, "default": 0}}},
    "formant_shift": {"name": "Formant Shift", "params": {"shift_factor": {"min": 0.5, "max": 2.0, "default": 1.0}}},
    "time_stretch": {"name": "Time Stretch", "params": {"factor": {"min": 0.5, "max": 2.0, "default": 1.0}}},
    "reverb": {
        "name": "Reverb",
        "params": {
            "room_size": {"min": 0, "max": 1, "default": 0.5},
            "damping": {"min": 0, "max": 1, "default": 0.5},
            "wet": {"min": 0, "max": 1, "default": 0.3},
        },
    },
    "delay": {
        "name": "Delay",
        "params": {
            "delay_ms": {"min": 10, "max": 1000, "default": 200},
            "feedback": {"min": 0, "max": 0.9, "default": 0.4},
            "mix": {"min": 0, "max": 1, "default": 0.3},
        },
    },
    "chorus": {
        "name": "Chorus",
        "params": {
            "depth": {"min": 0, "max": 0.01, "default": 0.002},
            "rate": {"min": 0.1, "max": 5, "default": 1.5},
            "mix": {"min": 0, "max": 1, "default": 0.5},
        },
    },
    "distortion": {
        "name": "Distortion",
        "params": {"gain": {"min": 1, "max": 10, "default": 2.0}, "mix": {"min": 0, "max": 1, "default": 0.5}},
    },
    "eq": {
        "name": "EQ",
        "params": {
            "low_gain": {"min": -12, "max": 12, "default": 0},
            "mid_gain": {"min": -12, "max": 12, "default": 0},
            "high_gain": {"min": -12, "max": 12, "default": 0},
        },
    },
    "compressor": {
        "name": "Compressor",
        "params": {
            "threshold": {"min": -60, "max": 0, "default": -20},
            "ratio": {"min": 1, "max": 20, "default": 4},
            "attack": {"min": 0.001, "max": 0.1, "default": 0.01},
            "release": {"min": 0.01, "max": 1, "default": 0.1},
        },
    },
    "noise_gate": {"name": "Noise Gate", "params": {"threshold": {"min": -60, "max": 0, "default": -40}}},
    "gender_swap": {"name": "Gender Swap", "params": {"amount": {"min": -1.0, "max": 1.0, "default": 0.0}}},
    "age_shift": {"name": "Age Shift", "params": {"amount": {"min": -1.0, "max": 1.0, "default": 0.0}}},
    "helium": {"name": "Helium", "params": {"intensity": {"min": 0.0, "max": 1.0, "default": 0.7}}},
    "vocoder": {
        "name": "Robot Vocoder",
        "params": {
            "rate_hz": {"min": 20, "max": 500, "default": 100},
            "depth": {"min": 0.0, "max": 1.0, "default": 0.8},
            "mix": {"min": 0, "max": 1, "default": 0.7},
        },
    },
    "telephone": {
        "name": "Telephone/Radio",
        "params": {
            "low_cutoff": {"min": 100, "max": 1000, "default": 300},
            "high_cutoff": {"min": 1000, "max": 8000, "default": 3500},
            "compression": {"min": 1, "max": 20, "default": 6},
            "gain_db": {"min": 0, "max": 20, "default": 6},
        },
    },
    "megaphone": {
        "name": "Megaphone",
        "params": {
            "distortion_gain": {"min": 1, "max": 10, "default": 4.0},
            "low_cutoff": {"min": 200, "max": 1000, "default": 400},
            "high_cutoff": {"min": 1000, "max": 5000, "default": 2500},
        },
    },
    "underwater": {
        "name": "Underwater",
        "params": {
            "cutoff": {"min": 200, "max": 2000, "default": 800},
            "reverb_amount": {"min": 0, "max": 1, "default": 0.6},
            "tremolo_rate": {"min": 0.5, "max": 10, "default": 3.0},
            "tremolo_depth": {"min": 0, "max": 1, "default": 0.4},
        },
    },
    "whisper_transform": {
        "name": "Whisper Transform",
        "params": {
            "breathiness": {"min": 0, "max": 1, "default": 0.7},
            "pitch_factor": {"min": 0.8, "max": 1.5, "default": 1.2},
        },
    },
    "auto_tune": {
        "name": "Auto-Tune",
        "params": {"speed": {"min": 0, "max": 1, "default": 0.5}, "strength": {"min": 0, "max": 1, "default": 0.8}},
    },
    "spectral_duck": {
        "name": "Spectral Ducking",
        "params": {
            "duck_amount_db": {"min": -30, "max": 0, "default": -12},
            "freq_low": {"min": 50, "max": 500, "default": 200},
            "freq_high": {"min": 1000, "max": 8000, "default": 4000},
            "threshold": {"min": -60, "max": 0, "default": -30},
        },
    },
    "multi_band_pitch": {
        "name": "Multi-Band Pitch",
        "params": {
            "low_semitones": {"min": -12, "max": 12, "default": 0},
            "mid_semitones": {"min": -12, "max": 12, "default": 0},
            "high_semitones": {"min": -12, "max": 12, "default": 0},
            "low_cutoff": {"min": 50, "max": 500, "default": 300},
            "high_cutoff": {"min": 1000, "max": 8000, "default": 3000},
        },
    },
    "resonant_filter_sweep": {
        "name": "Resonant Filter Sweep",
        "params": {
            "filter_type": {"min": 0, "max": 2, "default": 0},
            "cutoff_start": {"min": 20, "max": 2000, "default": 200},
            "cutoff_end": {"min": 500, "max": 20000, "default": 8000},
            "resonance": {"min": 0.1, "max": 1.0, "default": 0.5},
            "lfo_rate": {"min": 0.05, "max": 5.0, "default": 0.5},
        },
    },
    "spectral_repair": {
        "name": "Spectral Repair",
        "params": {"repair_type": {"min": 0, "max": 4, "default": 0}, "strength": {"min": 0, "max": 1, "default": 0.7}},
    },
    "multi_mic_phase": {"name": "Multi-Mic Phase Align", "params": {"strength": {"min": 0, "max": 1, "default": 0.5}}},
    "smart_crossfade": {
        "name": "Smart Crossfade",
        "params": {
            "fade_length_ms": {"min": 10, "max": 500, "default": 50},
            "curve": {"min": 0, "max": 3, "default": 3},
        },
    },
    "deesser": {
        "name": "De-Esser",
        "params": {
            "threshold_db": {"min": -40, "max": 0, "default": -18},
            "reduction_db": {"min": -18, "max": 0, "default": -6},
            "freq_low": {"min": 2000, "max": 6000, "default": 4000},
            "freq_high": {"min": 6000, "max": 12000, "default": 8000},
            "strength": {"min": 0, "max": 1, "default": 0.6},
        },
    },
    "spectral_denoise": {"name": "Spectral De-Noise", "params": {"amount": {"min": 0, "max": 1, "default": 0.7}}},
    "emotion_tone": {
        "name": "Emotion / Tone",
        "params": {
            "warmth": {"min": -1.0, "max": 1.0, "default": 0.0},
            "energy": {"min": -1.0, "max": 1.0, "default": 0.0},
            "brightness": {"min": -1.0, "max": 1.0, "default": 0.0},
            "formant": {"min": -1.0, "max": 1.0, "default": 0.0},
        },
    },
}


# ---------------------------------------------------------------------------
# Preset CRUD (called by backend/routes/effects.py)
# ---------------------------------------------------------------------------


def _preset_to_dict(preset: DBEffectPreset) -> dict:
    """Serialise a DB row to an EffectPresetResponse-compatible dict."""
    chain = json.loads(preset.effects_chain) if isinstance(preset.effects_chain, str) else preset.effects_chain
    return {
        "id": preset.id,
        "name": preset.name,
        "description": preset.description,
        "effects_chain": chain,
        "is_builtin": preset.is_builtin,
        "created_at": preset.created_at,
    }


def list_presets(db: Session) -> list[dict]:
    """Return all effect presets ordered by sort_order, then name."""
    rows = db.query(DBEffectPreset).order_by(DBEffectPreset.sort_order, DBEffectPreset.name).all()
    return [_preset_to_dict(r) for r in rows]


def get_preset(preset_id: str, db: Session) -> dict | None:
    """Return a single preset by ID, or None."""
    row = db.query(DBEffectPreset).filter_by(id=preset_id).first()
    return _preset_to_dict(row) if row else None


def create_preset(data, db: Session) -> dict:
    """Create a new user preset.  *data* is an EffectPresetCreate model."""
    existing = db.query(DBEffectPreset).filter_by(name=data.name).first()
    if existing:
        raise ValueError(f"Preset name '{data.name}' already exists")
    chain_json = json.dumps([e.model_dump() if hasattr(e, "model_dump") else e for e in data.effects_chain])
    preset = DBEffectPreset(
        name=data.name,
        description=data.description,
        effects_chain=chain_json,
        is_builtin=False,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return _preset_to_dict(preset)


def update_preset(preset_id: str, data, db: Session) -> dict | None:
    """Update an existing preset.  *data* is an EffectPresetUpdate model."""
    preset = db.query(DBEffectPreset).filter_by(id=preset_id).first()
    if not preset:
        return None
    if preset.is_builtin:
        raise ValueError("Cannot modify a built-in preset")
    if data.name is not None:
        dup = db.query(DBEffectPreset).filter(DBEffectPreset.name == data.name, DBEffectPreset.id != preset_id).first()
        if dup:
            raise ValueError(f"Preset name '{data.name}' already exists")
        preset.name = data.name
    if data.description is not None:
        preset.description = data.description
    if data.effects_chain is not None:
        preset.effects_chain = json.dumps(
            [e.model_dump() if hasattr(e, "model_dump") else e for e in data.effects_chain]
        )
    db.commit()
    db.refresh(preset)
    return _preset_to_dict(preset)


def delete_preset(preset_id: str, db: Session) -> bool:
    """Delete a user preset.  Returns False if not found."""
    preset = db.query(DBEffectPreset).filter_by(id=preset_id).first()
    if not preset:
        return False
    if preset.is_builtin:
        raise ValueError("Cannot delete a built-in preset")
    db.delete(preset)
    db.commit()
    return True
