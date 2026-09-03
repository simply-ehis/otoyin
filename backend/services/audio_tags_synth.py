"""Source-filter synthesis primitives for vocal tags.

All DSP functions used by :func:`audio_tags.generate_tag_audio` live here.
Separated from the main audio_tags module to keep the file under 1k lines
and to isolate the heavy signal-processing code from the tag-parsing /
application logic.

All functions follow the same contract::

    _gen_TAG(duration_ms, sr, params, ...) -> np.ndarray (float32, mono)

Constants (``VOWEL_FORMANTS``, ``_TAG_DURATIONS``, ``_MODIFIER_EFFECTS``)
also live here because the synth functions are their primary consumers.
The main ``audio_tags`` module imports them from here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

# ─── Constants ────────────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"\[([a-zA-Z][a-zA-Z0-9 ]*)\]")

_TAG_DURATIONS: dict[str, tuple[float, float]] = {
    "pause": (500.0, 200.0),
    "short pause": (250.0, 100.0),
    "long pause": (1000.0, 300.0),
    "breath": (350.0, 100.0),
    "breaths": (450.0, 150.0),
    "sigh": (800.0, 200.0),
    "gasp": (400.0, 100.0),
    "gulps": (300.0, 80.0),
    "laughs": (900.0, 300.0),
    "chuckles": (700.0, 200.0),
    "giggles": (600.0, 200.0),
    "hmmm": (600.0, 200.0),
    "umm": (400.0, 150.0),
    "uhh": (350.0, 120.0),
    "whisper": (0.0, 0.0),
    "shout": (0.0, 0.0),
    "cough": (350.0, 100.0),
    "yawn": (1200.0, 300.0),
    "tsk": (150.0, 50.0),
}

# Real acoustic parameters — not made-up multipliers
_MODIFIER_EFFECTS: dict[str, dict[str, float]] = {
    "shy": {"pitch_mult": 1.05, "energy_mult": 0.4, "duration_mult": 0.7, "jitter": 0.15, "aspiration_mix": 0.6},
    "quickly": {"pitch_mult": 1.0, "energy_mult": 0.6, "duration_mult": 0.5, "jitter": 0.1, "aspiration_mix": 0.3},
    "slowly": {"pitch_mult": 0.97, "energy_mult": 0.5, "duration_mult": 1.5, "jitter": 0.08, "aspiration_mix": 0.4},
    "nervously": {"pitch_mult": 1.08, "energy_mult": 0.7, "duration_mult": 0.8, "jitter": 0.18, "aspiration_mix": 0.5},
    "thoughtfully": {
        "pitch_mult": 0.98,
        "energy_mult": 0.4,
        "duration_mult": 1.3,
        "jitter": 0.08,
        "aspiration_mix": 0.4,
    },
    "softly": {"pitch_mult": 1.0, "energy_mult": 0.3, "duration_mult": 0.9, "jitter": 0.1, "aspiration_mix": 0.5},
    "loudly": {"pitch_mult": 1.0, "energy_mult": 1.0, "duration_mult": 1.1, "jitter": 0.05, "aspiration_mix": 0.2},
    "deep": {"pitch_mult": 0.85, "energy_mult": 0.8, "duration_mult": 1.2, "jitter": 0.06, "aspiration_mix": 0.3},
    "quick": {"pitch_mult": 1.0, "energy_mult": 0.6, "duration_mult": 0.5, "jitter": 0.1, "aspiration_mix": 0.3},
}

# Formant presets — (center_freq_hz, bandwidth_hz, gain)
VOWEL_FORMANTS = {
    "open_a": [(750, 80, 1.0), (1200, 90, 0.7), (2600, 120, 0.3)],
    "central_uh": [(600, 70, 1.0), (1100, 90, 0.6), (2500, 120, 0.3)],
    "neutral_schwa": [(500, 70, 1.0), (1500, 100, 0.5), (2500, 120, 0.25)],
    "nasal_hum": [(250, 60, 1.0), (1000, 150, 0.4), (2200, 200, 0.2)],
    "closed_uh": [(400, 60, 1.0), (1000, 80, 0.5), (2400, 100, 0.2)],
    "open_eh": [(600, 70, 1.0), (1800, 100, 0.6), (2700, 120, 0.3)],
}


# ─── Source-filter synthesis primitives ───────────────────────────────────────


def glottal_pulse_cycle(t1: float, t2: float, sr: int) -> np.ndarray:
    """One Rosenberg glottal cycle. t1=opening, t2=closing phase duration."""
    n1 = max(1, int(t1 * sr))
    n2 = max(1, int(t2 * sr))
    opening = 0.5 * (1 - np.cos(np.pi * np.arange(n1) / n1))
    closing = np.cos(np.pi * np.arange(n2) / (2 * n2))
    return np.concatenate([opening, closing])


def glottal_pulse_train(
    f0_contour,
    duration_s: float,
    sr: int,
    jitter: float = 0.01,
    shimmer: float = 0.03,
    open_quotient: float = 0.6,
    energy: float = 1.0,
) -> np.ndarray:
    """Generate a glottal pulse train with jitter and shimmer."""
    rng = np.random.default_rng()
    out = []
    t = 0.0
    while t < duration_s:
        f0 = f0_contour(t) * (1 + rng.uniform(-jitter, jitter))
        f0 = max(50.0, min(f0, 600.0))
        period = 1.0 / f0
        t1 = period * open_quotient
        t2 = period * (1 - open_quotient)
        amp = energy * (1 + rng.uniform(-shimmer, shimmer))
        cycle = glottal_pulse_cycle(t1, t2, sr) * amp
        out.append(cycle)
        t += period
    if not out:
        return np.array([], dtype=np.float32)
    return np.concatenate(out).astype(np.float32)


def formant_bank(
    signal: np.ndarray,
    sr: int,
    formants: list[tuple[float, float, float]],
) -> np.ndarray:
    """Filter signal through a parallel bank of resonant bandpass filters."""
    from scipy.signal import butter, sosfilt

    out = np.zeros_like(signal)
    for f_center, bw, gain in formants:
        low = max(f_center - bw / 2, 20)
        high = min(f_center + bw / 2, sr / 2 - 1)
        if low >= high:
            continue
        sos = butter(2, [low, high], btype="band", fs=sr, output="sos")
        out += gain * sosfilt(sos, signal)
    return out


def aspiration_noise(
    duration_s: float,
    sr: int,
    low: float = 400,
    high: float = 4000,
    energy: float = 0.3,
    jitter: float = 0.0,
) -> np.ndarray:
    """Generate filtered aspiration noise with optional amplitude jitter."""
    from scipy.signal import butter, sosfilt

    n_samples = int(duration_s * sr)
    if n_samples < 1:
        return np.array([], dtype=np.float32)

    rng = np.random.default_rng()
    noise = rng.standard_normal(n_samples).astype(np.float32)

    low_norm = low / (sr / 2)
    high_norm = min(high / (sr / 2), 0.99)
    if low_norm >= high_norm:
        return noise * energy

    sos = butter(2, [low_norm, high_norm], btype="band", fs=sr, output="sos")
    filtered = sosfilt(sos, noise)

    if jitter > 0:
        mod = 1.0 + jitter * rng.standard_normal(n_samples).astype(np.float32)
        filtered *= mod

    return filtered * energy


# ─── Timing helpers ───────────────────────────────────────────────────────────


def laugh_burst_timing(
    n_bursts: int,
    base_interval: float = 0.15,
    accel: float = 0.08,
    jitter: float = 0.15,
) -> list[tuple[float, float]]:
    """Returns list of (start_time, energy) for each burst."""
    rng = np.random.default_rng()
    times: list[float] = []
    energies: list[float] = []
    t = 0.0
    interval = base_interval
    for i in range(n_bursts):
        jittered_t = t + rng.uniform(-jitter, jitter) * interval
        times.append(max(0.0, jittered_t))
        energies.append(max(0.3, 1.0 - i * 0.12))
        interval *= 1 + accel
        t += interval
    return list(zip(times, energies, strict=False))


# ─── Utility ──────────────────────────────────────────────────────────────────


def apply_fades(audio: np.ndarray, sr: int, fade_ms: float = 5.0) -> None:
    """Short fade in/out to avoid clicks. Modifies in place."""
    n_fade = min(int(sr * fade_ms / 1000.0), len(audio) // 4)
    if n_fade < 1:
        return
    audio[:n_fade] *= np.linspace(0.0, 1.0, n_fade, dtype=np.float32)
    audio[-n_fade:] *= np.linspace(1.0, 0.0, n_fade, dtype=np.float32)


def normalize(audio: np.ndarray, peak: float = 0.7) -> np.ndarray:
    """Normalize audio to a target peak amplitude."""
    mx = float(np.abs(audio).max())
    if mx > 1e-6:
        audio = audio * (peak / mx)
    return audio


# ─── Dataclasses (imported by audio_tags) ─────────────────────────────────────


@dataclass
class ParsedTag:
    tag: str
    modifiers: list[str] = field(default_factory=list)
    raw: str = ""


@dataclass
class TextSegment:
    text: str
    tag: ParsedTag | None = None


@dataclass
class SynthParams:
    pitch_mult: float = 1.0
    energy_mult: float = 0.5
    duration_mult: float = 1.0
    jitter: float = 0.05
    aspiration_mix: float = 0.3


def resolve_params(tag: ParsedTag) -> SynthParams:
    """Resolve tag + modifiers into SynthParams."""
    p = SynthParams()
    for mod in tag.modifiers:
        if mod in _MODIFIER_EFFECTS:
            eff = _MODIFIER_EFFECTS[mod]
            p.pitch_mult *= eff["pitch_mult"]
            p.energy_mult = max(0.1, min(1.0, p.energy_mult * (eff["energy_mult"] / 0.5)))
            p.duration_mult *= eff["duration_mult"]
            p.jitter = max(p.jitter, eff["jitter"])
            p.aspiration_mix = max(p.aspiration_mix, eff["aspiration_mix"])
    return p


def resolve_duration(tag: ParsedTag) -> float:
    """Get final duration in ms after modifier scaling."""
    base_ms, _variance = _TAG_DURATIONS.get(tag.tag, (300.0, 100.0))
    params = resolve_params(tag)
    return base_ms * params.duration_mult


# ─── Family B: Mechanical tags (DSP) ────────────────────────────────────────


def gen_pause(duration_ms: float, sr: int = 24000) -> np.ndarray:
    return np.zeros(int(sr * duration_ms / 1000.0), dtype=np.float32)


def gen_breath(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Breath: aspiration noise with inhale envelope + jitter."""
    duration_s = duration_ms / 1000.0
    n_samples = int(sr * duration_s)
    if n_samples < 1:
        return np.array([], dtype=np.float32)

    noise = aspiration_noise(duration_s, sr, low=400, high=4000, energy=0.3 * params.energy_mult, jitter=0.1)

    attack = int(n_samples * 0.15)
    release = int(n_samples * 0.35)
    sustain = n_samples - attack - release
    envelope = np.concatenate(
        [
            np.linspace(0.0, 1.0, attack, dtype=np.float32),
            np.ones(sustain, dtype=np.float32) * (0.6 + 0.4 * params.energy_mult),
            np.linspace(1.0, 0.0, release, dtype=np.float32),
        ]
    )[:n_samples]

    rng = np.random.default_rng()
    envelope *= 1.0 + 0.05 * rng.standard_normal(n_samples).astype(np.float32)

    result = noise * envelope
    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_gasp(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Gasp: sharp high-frequency inhalation burst."""
    duration_s = duration_ms / 1000.0
    n_samples = int(sr * duration_s)
    if n_samples < 1:
        return np.array([], dtype=np.float32)

    noise = aspiration_noise(duration_s, sr, low=800, high=5000, energy=0.4 * params.energy_mult)
    t_norm = np.linspace(0.0, 1.0, n_samples, dtype=np.float32)
    envelope = np.exp(-3.0 * t_norm)
    result = noise * envelope
    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_tsk(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Tsk: click transient with randomized resonance."""
    from scipy.signal import butter, sosfilt

    n_samples = int(sr * duration_ms / 1000.0)
    if n_samples < 1:
        return np.array([], dtype=np.float32)

    rng = np.random.default_rng()
    result = np.zeros(n_samples, dtype=np.float32)

    click_len = min(int(sr * 0.005), n_samples)
    click = rng.standard_normal(click_len).astype(np.float32)
    sos = butter(2, [2000, min(8000, sr / 2 - 1)], btype="band", fs=sr, output="sos")
    click = sosfilt(sos, click) * params.energy_mult * 0.6
    result[:click_len] = click

    res_len = min(int(sr * 0.02), n_samples - click_len)
    if res_len > 0:
        res_freq = 3000.0 * (1.0 + rng.uniform(-0.05, 0.05))
        t = np.linspace(0.0, res_len / sr, res_len, dtype=np.float32)
        resonance = np.sin(2 * np.pi * res_freq * t).astype(np.float32) * 0.1 * params.energy_mult
        resonance *= np.exp(-10.0 * t)
        result[click_len : click_len + res_len] = resonance

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


# ─── Family A: Vocal tags (source-filter) ────────────────────────────────────


def gen_laugh(duration_ms: float, sr: int, params: SynthParams, style: str = "laugh") -> np.ndarray:
    """Laugh: decelerating bursts through glottal source + open_a formants."""
    if style == "chuckle":
        f0_base, n_bursts, burst_dur_s = 150.0, 5, 0.06
    elif style == "giggle":
        f0_base, n_bursts, burst_dur_s = 220.0, 7, 0.045
    else:
        f0_base, n_bursts, burst_dur_s = 180.0, 6, 0.055

    f0_base *= params.pitch_mult
    burst_timing = laugh_burst_timing(n_bursts, base_interval=burst_dur_s * 1.8)

    if burst_timing:
        last_t, _last_e = burst_timing[-1]
        total_s = last_t + burst_dur_s + 0.1
    else:
        total_s = duration_ms / 1000.0

    total_s = min(total_s, duration_ms / 1000.0)
    n_total = int(sr * total_s)
    result = np.zeros(n_total, dtype=np.float32)

    formants = VOWEL_FORMANTS["open_a"]

    for burst_start, burst_energy in burst_timing:
        pos = int(burst_start * sr)
        n_burst = int(sr * burst_dur_s)
        if pos + n_burst > n_total:
            n_burst = n_total - pos
        if n_burst < 1:
            continue

        def f0_contour(t, _f0=f0_base, _e=burst_energy):
            progress = t / burst_dur_s
            return _f0 * (1.0 + 0.1 * np.sin(np.pi * progress)) * _e

        source = glottal_pulse_train(
            f0_contour,
            burst_dur_s,
            sr,
            jitter=params.jitter,
            shimmer=0.03,
            energy=burst_energy * params.energy_mult,
        )
        if len(source) < 1:
            continue

        voiced = formant_bank(source, sr, formants)

        asp_ratio = params.aspiration_mix + (1.0 - burst_energy) * 0.3
        asp = aspiration_noise(burst_dur_s, sr, energy=asp_ratio * 0.2 * params.energy_mult)
        min_len = min(len(voiced), len(asp))
        voiced = voiced[:min_len] + asp[:min_len]

        env = np.ones(len(voiced), dtype=np.float32)
        attack = min(int(len(voiced) * 0.1), len(voiced))
        release = min(int(len(voiced) * 0.3), len(voiced))
        if attack > 0:
            env[:attack] = np.linspace(0.0, 1.0, attack, dtype=np.float32)
        if release > 0:
            env[-release:] = np.linspace(1.0, 0.0, release, dtype=np.float32)
        voiced *= env

        end = min(pos + len(voiced), n_total)
        result[pos:end] += voiced[: end - pos]

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_hmmm(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Hmmm: sustained nasal hum through glottal source + nasal_hum formants."""
    duration_s = duration_ms / 1000.0
    f0_base = 120.0 * params.pitch_mult

    def f0_contour(t):
        progress = t / duration_s
        return f0_base * (1.0 + 0.1 * np.sin(np.pi * progress))

    source = glottal_pulse_train(
        f0_contour,
        duration_s,
        sr,
        jitter=params.jitter,
        shimmer=0.02,
        energy=params.energy_mult * 0.3,
    )
    if len(source) < 1:
        return np.array([], dtype=np.float32)

    voiced = formant_bank(source, sr, VOWEL_FORMANTS["nasal_hum"])

    asp = aspiration_noise(duration_s, sr, energy=params.aspiration_mix * 0.1)
    min_len = min(len(voiced), len(asp))
    result = voiced[:min_len] + asp[:min_len]

    target = int(sr * duration_s)
    if len(result) < target:
        result = np.pad(result, (0, target - len(result)))
    result = result[:target]

    n = len(result)
    attack = int(n * 0.1)
    release = int(n * 0.2)
    env = np.ones(n, dtype=np.float32)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack, dtype=np.float32)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release, dtype=np.float32)
    result *= env

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_sigh(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Sigh: aspiration-heavy onset -> descending glottal tone -> schwa formants."""
    duration_s = duration_ms / 1000.0
    n_samples = int(sr * duration_s)
    f0_base = 180.0 * params.pitch_mult

    def f0_contour(t):
        progress = t / duration_s
        return f0_base * np.exp(-1.5 * progress)

    source = glottal_pulse_train(
        f0_contour,
        duration_s,
        sr,
        jitter=params.jitter,
        shimmer=0.03,
        energy=params.energy_mult * 0.2,
    )
    if len(source) < 1:
        return np.array([], dtype=np.float32)

    voiced = formant_bank(source, sr, VOWEL_FORMANTS["neutral_schwa"])

    asp = aspiration_noise(duration_s, sr, energy=0.25 * params.energy_mult)
    min_len = min(len(voiced), len(asp))
    result = voiced[:min_len] + asp[:min_len]

    if len(result) < n_samples:
        result = np.pad(result, (0, n_samples - len(result)))
    result = result[:n_samples]

    attack = int(n_samples * 0.1)
    release = int(n_samples * 0.5)
    env = np.ones(n_samples, dtype=np.float32)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack, dtype=np.float32)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release, dtype=np.float32)
    result *= env

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_cough(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Cough: noise burst (phase 1) + short glottal through uh formants (phase 2)."""
    from scipy.signal import butter, sosfilt

    duration_s = duration_ms / 1000.0
    n_samples = int(sr * duration_s)
    split = int(n_samples * 0.3)

    rng = np.random.default_rng()

    noise = rng.standard_normal(split).astype(np.float32)
    sos = butter(2, [600, min(4000, sr / 2 - 1)], btype="band", fs=sr, output="sos")
    burst = sosfilt(sos, noise) * params.energy_mult * 0.5

    remaining_s = (n_samples - split) / sr
    f0_start = 200.0 * params.pitch_mult

    def f0_contour(t):
        return f0_start * np.exp(-3.0 * t / remaining_s) if remaining_s > 0 else 0

    source = glottal_pulse_train(
        f0_contour,
        remaining_s,
        sr,
        jitter=params.jitter,
        shimmer=0.05,
        energy=params.energy_mult * 0.3,
    )
    if len(source) > 0:
        vocal = formant_bank(source, sr, VOWEL_FORMANTS["central_uh"])
    else:
        vocal = np.array([], dtype=np.float32)

    result = np.concatenate([burst, vocal]) if len(vocal) > 0 else burst

    if len(result) < n_samples:
        result = np.pad(result, (0, n_samples - len(result)))
    result = result[:n_samples]

    attack = int(n_samples * 0.05)
    release = int(n_samples * 0.3)
    env = np.ones(n_samples, dtype=np.float32)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack, dtype=np.float32)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release, dtype=np.float32)
    result *= env

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_yawn(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Yawn: slow rising-falling glottal tone through closed_uh formants."""
    duration_s = duration_ms / 1000.0
    n_samples = int(sr * duration_s)
    f0_base = 140.0 * params.pitch_mult

    def f0_contour(t):
        progress = t / duration_s
        return f0_base * (1.0 + 0.4 * np.sin(np.pi * progress))

    source = glottal_pulse_train(
        f0_contour,
        duration_s,
        sr,
        jitter=params.jitter,
        shimmer=0.03,
        energy=params.energy_mult * 0.25,
    )
    if len(source) < 1:
        return np.array([], dtype=np.float32)

    voiced = formant_bank(source, sr, VOWEL_FORMANTS["closed_uh"])

    asp = aspiration_noise(duration_s, sr, energy=params.aspiration_mix * 0.15)
    min_len = min(len(voiced), len(asp))
    result = voiced[:min_len] + asp[:min_len]

    if len(result) < n_samples:
        result = np.pad(result, (0, n_samples - len(result)))
    result = result[:n_samples]

    attack = int(n_samples * 0.25)
    release = int(n_samples * 0.35)
    env = np.ones(n_samples, dtype=np.float32)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack, dtype=np.float32)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release, dtype=np.float32)
    result *= env

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_gulps(duration_ms: float, sr: int, params: SynthParams) -> np.ndarray:
    """Gulps: 2-3 short glottal thumps through closed_uh formants."""
    n_samples = int(sr * duration_ms / 1000.0)
    if n_samples < 1:
        return np.array([], dtype=np.float32)

    result = np.zeros(n_samples, dtype=np.float32)
    n_bursts = 3
    burst_len = n_samples // (n_bursts * 2)

    for i in range(n_bursts):
        start = i * burst_len * 2
        if start + burst_len > n_samples:
            break

        burst_s = burst_len / sr
        f0 = (100.0 + i * 20.0) * params.pitch_mult

        source = glottal_pulse_train(
            lambda t, _f0=f0: _f0,
            burst_s,
            sr,
            jitter=params.jitter,
            shimmer=0.05,
            energy=params.energy_mult * 0.4,
        )
        if len(source) > 0:
            voiced = formant_bank(source, sr, VOWEL_FORMANTS["closed_uh"])
            env = np.exp(-5.0 * np.linspace(0.0, 1.0, len(voiced), dtype=np.float32))
            voiced *= env
            end = min(start + len(voiced), n_samples)
            result[start:end] += voiced[: end - start]

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)


def gen_uhm(duration_ms: float, sr: int, params: SynthParams, filler_type: str = "umm") -> np.ndarray:
    """Umm/Uhh: short hesitation through glottal + closed_uh formants."""
    duration_s = duration_ms / 1000.0
    f0_base = {"umm": 170.0, "uhh": 140.0}.get(filler_type, 160.0)
    f0_base *= params.pitch_mult

    def f0_contour(t):
        progress = t / duration_s
        wobble = 1.0 + 0.05 * np.sin(8.0 * np.pi * progress)
        return f0_base * wobble

    source = glottal_pulse_train(
        f0_contour,
        duration_s,
        sr,
        jitter=params.jitter,
        shimmer=0.02,
        energy=params.energy_mult * 0.25,
    )
    if len(source) < 1:
        return np.array([], dtype=np.float32)

    voiced = formant_bank(source, sr, VOWEL_FORMANTS["closed_uh"])

    asp = aspiration_noise(duration_s, sr, energy=params.aspiration_mix * 0.15)
    min_len = min(len(voiced), len(asp))
    result = voiced[:min_len] + asp[:min_len]

    n_samples = int(sr * duration_s)
    if len(result) < n_samples:
        result = np.pad(result, (0, n_samples - len(result)))
    result = result[:n_samples]

    env = np.ones(n_samples, dtype=np.float32)
    attack = int(n_samples * 0.1)
    release = int(n_samples * 0.2)
    if attack > 0:
        env[:attack] = np.linspace(0.0, 1.0, attack, dtype=np.float32)
    if release > 0:
        env[-release:] = np.linspace(1.0, 0.0, release, dtype=np.float32)
    result *= env

    apply_fades(result, sr)
    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32)
