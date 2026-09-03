"""Generate a minimal starter set of vocal samples using improved DSP.

This creates a small working library so the sample-based system functions
immediately. Replace with real human recordings by running:
    python -m backend.scripts.curate_vocal_samples --per-tag 10

The curation script downloads from TTS-AGI/vocal-bursts (open dataset).
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import soundfile as sf

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

SR = 24000


def _add_noise(audio: np.ndarray, level: float = 0.02) -> np.ndarray:
    """Add subtle noise for naturalness."""
    rng = np.random.default_rng()
    return audio + rng.standard_normal(len(audio)).astype(np.float32) * level


def gen_laugh(dur: float = 0.6) -> np.ndarray:
    """Realistic laugh: decelerating voiced bursts with aspiration."""
    rng = np.random.default_rng()
    n_samples = int(SR * dur)
    result = np.zeros(n_samples, dtype=np.float32)

    # 5-7 bursts, decelerating
    n_bursts = rng.integers(5, 8)
    t = 0.05
    interval = 0.08

    for i in range(n_bursts):
        burst_dur = rng.uniform(0.04, 0.07)
        energy = max(0.3, 1.0 - i * 0.12)
        f0 = rng.uniform(160, 220)

        start = int(t * SR)
        end = min(start + int(burst_dur * SR), n_samples)
        if start >= n_samples:
            break

        length = end - start
        tt = np.arange(length) / SR

        # Voiced component: harmonic stack
        phase = rng.uniform(0, 2 * np.pi)
        voiced = np.zeros(length, dtype=np.float32)
        for harmonic in range(1, 6):
            voiced += np.sin(2 * np.pi * f0 * harmonic * tt + phase) / harmonic

        # Aspiration noise
        noise = rng.standard_normal(length).astype(np.float32) * 0.3

        # Mix: more noise toward end of burst
        mix = np.linspace(0.7, 0.3, length, dtype=np.float32)
        burst = voiced * mix + noise * (1 - mix)

        # Envelope: sharp attack, medium decay
        env = np.exp(-4 * tt / burst_dur)
        env[: int(0.005 * SR)] = np.linspace(0, 1, min(int(0.005 * SR), length))

        result[start:end] += burst * env * energy * 0.6

        t += interval
        interval *= 1.15  # Decelerate

    return np.clip(_add_noise(result, 0.01), -1.0, 1.0).astype(np.float32)


def gen_chuckle(dur: float = 0.5) -> np.ndarray:
    """Soft chuckle: quieter, more breathy than laugh."""
    laugh = gen_laugh(dur)
    # Low-pass filter for softer quality
    from scipy.signal import butter, sosfilt

    sos = butter(2, 1500, btype="low", fs=SR, output="sos")
    filtered = sosfilt(sos, laugh)
    return np.clip(filtered * 0.5, -1.0, 1.0).astype(np.float32)


def gen_giggle(dur: float = 0.4) -> np.ndarray:
    """Quick giggle: higher pitch, faster bursts."""
    rng = np.random.default_rng()
    n_samples = int(SR * dur)
    result = np.zeros(n_samples, dtype=np.float32)

    n_bursts = rng.integers(6, 9)
    t = 0.03
    interval = 0.05

    for i in range(n_bursts):
        burst_dur = rng.uniform(0.025, 0.04)
        energy = max(0.4, 1.0 - i * 0.1)
        f0 = rng.uniform(250, 350)  # Higher pitch

        start = int(t * SR)
        end = min(start + int(burst_dur * SR), n_samples)
        if start >= n_samples:
            break

        length = end - start
        tt = np.arange(length) / SR

        voiced = np.sin(2 * np.pi * f0 * tt) * 0.7
        noise = rng.standard_normal(length).astype(np.float32) * 0.2
        env = np.exp(-5 * tt / burst_dur)
        result[start:end] += (voiced + noise) * env * energy * 0.5

        t += interval
        interval *= 1.1

    return np.clip(_add_noise(result, 0.01), -1.0, 1.0).astype(np.float32)


def gen_sigh(dur: float = 0.8) -> np.ndarray:
    """Sigh: breathy exhale with descending pitch."""
    n_samples = int(SR * dur)
    tt = np.arange(n_samples, dtype=np.float32) / SR

    # Descending pitch contour
    f0 = 180 * np.exp(-2.0 * tt)
    phase = np.cumsum(2 * np.pi * f0 / SR)

    voiced = np.sin(phase).astype(np.float32) * 0.4
    rng = np.random.default_rng()
    breath = rng.standard_normal(n_samples).astype(np.float32) * 0.25

    # Breath envelope: gradual fade
    env = np.exp(-2.5 * tt)
    mix = np.linspace(0.3, 0.7, n_samples, dtype=np.float32)

    result = voiced * (1 - mix) * env + breath * mix * env
    return np.clip(_add_noise(result, 0.005), -1.0, 1.0).astype(np.float32)


def gen_cough(dur: float = 0.3) -> np.ndarray:
    """Cough: noise burst with resonance."""
    n_samples = int(SR * dur)
    rng = np.random.default_rng()

    # Phase 1: sharp burst
    burst_len = min(int(0.06 * SR), n_samples)
    burst = rng.standard_normal(burst_len).astype(np.float32)
    from scipy.signal import butter, sosfilt

    sos = butter(2, [400, 3500], btype="band", fs=SR, output="sos")
    burst = sosfilt(sos, burst)

    # Phase 2: resonance
    res_len = min(int(0.15 * SR), n_samples - burst_len)
    t = np.arange(res_len, dtype=np.float32) / SR
    resonance = np.sin(2 * np.pi * 250 * t) * np.exp(-8 * t) * 0.3

    result = np.zeros(n_samples, dtype=np.float32)
    result[:burst_len] = burst * 0.8
    result[burst_len : burst_len + res_len] = resonance

    # Overall envelope
    env = np.ones(n_samples, dtype=np.float32)
    if n_samples > 10:
        env[:5] = np.linspace(0, 1, 5)
        env[-min(20, n_samples) :] = np.linspace(1, 0, min(20, n_samples))

    return np.clip(result * env, -1.0, 1.0).astype(np.float32)


def gen_yawn(dur: float = 1.2) -> np.ndarray:
    """Yawn: slow inhale-exhale with pitch arc."""
    n_samples = int(SR * dur)
    tt = np.arange(n_samples, dtype=np.float32) / SR

    # Pitch arc: rise then fall
    f0 = 150 + 60 * np.sin(np.pi * tt / dur)
    phase = np.cumsum(2 * np.pi * f0 / SR)

    voiced = np.sin(phase).astype(np.float32)
    rng = np.random.default_rng()
    breath = rng.standard_normal(n_samples).astype(np.float32) * 0.15

    # Envelope: swell in middle  # noqa: ERA001
    env = np.sin(np.pi * tt / dur) ** 0.5
    # More breathy at start and end
    mix = 0.3 + 0.4 * np.abs(2 * tt / dur - 1)

    result = voiced * (1 - mix) * env * 0.5 + breath * mix * env
    return np.clip(_add_noise(result, 0.005), -1.0, 1.0).astype(np.float32)


def gen_gasp(dur: float = 0.3) -> np.ndarray:
    """Gasp: sharp inhale."""
    n_samples = int(SR * dur)
    rng = np.random.default_rng()
    noise = rng.standard_normal(n_samples).astype(np.float32)

    from scipy.signal import butter, sosfilt

    sos = butter(2, [800, 4000], btype="band", fs=SR, output="sos")
    filtered = sosfilt(sos, noise)

    # Sharp attack, quick decay
    env = np.exp(-6 * np.arange(n_samples, dtype=np.float32) / SR)
    return np.clip(filtered * env * 0.5, -1.0, 1.0).astype(np.float32)


def gen_gulp(dur: float = 0.25) -> np.ndarray:
    """Gulp: short resonant swallow."""
    n_samples = int(SR * dur)
    rng = np.random.default_rng()
    t = np.arange(n_samples, dtype=np.float32) / SR

    # Two quick resonant pulses
    pulse1 = np.sin(2 * np.pi * 300 * t) * np.exp(-15 * t) * 0.5
    pulse2 = np.sin(2 * np.pi * 250 * t) * np.exp(-15 * (t - 0.08)) * 0.3
    pulse2 = np.where(t > 0.08, pulse2, 0)

    noise = rng.standard_normal(n_samples).astype(np.float32) * 0.1
    result = pulse1 + pulse2 + noise

    return np.clip(result, -1.0, 1.0).astype(np.float32)


def gen_tsk(dur: float = 0.12) -> np.ndarray:
    """Tsk: click transient."""
    n_samples = int(SR * dur)
    rng = np.random.default_rng()

    click_len = min(int(0.004 * SR), n_samples)
    click = rng.standard_normal(click_len).astype(np.float32)
    from scipy.signal import butter, sosfilt

    sos = butter(2, [2000, 8000], btype="band", fs=SR, output="sos")
    click = sosfilt(sos, click) * 0.7

    # Resonance tail
    tail_len = n_samples - click_len
    t = np.arange(tail_len, dtype=np.float32) / SR
    resonance = np.sin(2 * np.pi * 3500 * t) * np.exp(-20 * t) * 0.15

    result = np.zeros(n_samples, dtype=np.float32)
    result[:click_len] = click
    result[click_len:] = resonance

    return np.clip(result, -1.0, 1.0).astype(np.float32)


def gen_hmmm(dur: float = 0.6) -> np.ndarray:
    """Hmmm: sustained nasal hum."""
    n_samples = int(SR * dur)
    tt = np.arange(n_samples, dtype=np.float32) / SR

    f0 = 160
    phase = np.cumsum(2 * np.pi * f0 / SR)
    voiced = np.sin(phase).astype(np.float32) * 0.4

    # Subtle vibrato
    vibrato = 1.0 + 0.02 * np.sin(2 * np.pi * 5 * tt)
    voiced = voiced * vibrato

    # Gentle envelope
    env = np.ones(n_samples, dtype=np.float32)
    if n_samples > 20:
        env[:10] = np.linspace(0, 1, 10)
        env[-10:] = np.linspace(1, 0, 10)

    return np.clip(voiced * env, -1.0, 1.0).astype(np.float32)


def gen_grunt(dur: float = 0.3) -> np.ndarray:
    """Short grunt (for umm/uhh)."""
    n_samples = int(SR * dur)
    rng = np.random.default_rng()
    tt = np.arange(n_samples, dtype=np.float32) / SR

    f0 = rng.uniform(100, 140)
    voiced = np.sin(2 * np.pi * f0 * tt).astype(np.float32) * 0.3
    noise = rng.standard_normal(n_samples).astype(np.float32) * 0.15

    env = np.exp(-5 * tt)
    result = (voiced + noise) * env

    return np.clip(result, -1.0, 1.0).astype(np.float32)


def gen_breath(dur: float = 0.3) -> np.ndarray:
    """Breath: filtered noise inhale/exhale."""
    n_samples = int(SR * dur)
    rng = np.random.default_rng()
    noise = rng.standard_normal(n_samples).astype(np.float32)

    from scipy.signal import butter, sosfilt

    sos = butter(2, [600, 3000], btype="band", fs=SR, output="sos")
    filtered = sosfilt(sos, noise)

    env = np.sin(np.pi * np.arange(n_samples, dtype=np.float32) / n_samples)
    return np.clip(filtered * env * 0.4, -1.0, 1.0).astype(np.float32)


# ─── Tag → generator mapping ──────────────────────────────────────────────────

GENERATORS = {
    "laughs": gen_laugh,
    "chuckles": gen_chuckle,
    "giggles": gen_giggle,
    "sigh": gen_sigh,
    "cough": gen_cough,
    "yawn": gen_yawn,
    "gasp": gen_gasp,
    "gulps": gen_gulp,
    "tsk": gen_tsk,
    "hmmm": gen_hmmm,
    "umm": gen_grunt,
    "uhh": gen_grunt,
    "breath": gen_breath,
    "breaths": gen_breath,
}


def generate_all(output_dir: Path, per_tag: int = 3):
    """Generate starter samples for all tags."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for tag, gen_fn in GENERATORS.items():
        tag_dir = output_dir / tag / "normal"
        tag_dir.mkdir(parents=True, exist_ok=True)

        for i in range(per_tag):
            audio = gen_fn()
            filepath = tag_dir / f"{tag}_normal_{i:02d}.wav"
            sf.write(str(filepath), audio, SR)

        logger.info("Tag '%s': generated %d samples", tag, per_tag)

    total = per_tag * len(GENERATORS)
    logger.info("\n=== Done ===")
    logger.info("Generated %d starter samples in %s", total, output_dir)
    logger.info("Replace with real human recordings by running:")
    logger.info("  python -m backend.scripts.curate_vocal_samples --per-tag 10")


if __name__ == "__main__":
    import sys

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/vocal_samples")
    generate_all(out)
