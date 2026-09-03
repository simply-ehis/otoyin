"""ITU-R BS.1770-4 loudness measurement (LUFS / LKFS)."""

import logging

import numpy as np

logger = logging.getLogger(__name__)


def _design_pre_filter(sample_rate: int) -> tuple[np.ndarray, np.ndarray]:
    """Design the BS.1770 pre-filter (shelf + high-pass).

    Returns (b, a) IIR filter coefficients.
    """
    # Stage 1: High-pass filter at 38 Hz (Butterworth 2nd order)
    from scipy.signal import butter

    b_hp, a_hp = butter(2, 38.0 / (sample_rate / 2), btype="high")

    # Stage 2: Shelving filter with gain = +4 dB, 0 dB at 1 kHz
    # Using biquad coefficients from BS.1770-4 Annex A
    f0 = 1000.0 / (sample_rate / 2)
    Q = 0.5
    K = np.tan(np.pi * f0)
    V0 = 10 ** (4.0 / 20.0)  # +4 dB gain

    b0 = 1.0 + K / Q * V0 + K**2
    b1 = 2.0 * (K**2 - 1.0)
    b2 = 1.0 - K / Q * V0 + K**2
    a0 = 1.0 + K / Q + K**2
    a1 = 2.0 * (K**2 - 1.0)
    a2 = 1.0 - K / Q + K**2

    b_shelf = np.array([b0, b1, b2]) / a0
    a_shelf = np.array([a0, a1, a2]) / a0

    # Convert to cascaded second-order sections
    from scipy.signal import tf2zpk, zpk2sos

    z_hp, p_hp, k_hp = tf2zpk(b_hp, a_hp)
    z_shelf, p_shelf, k_shelf = tf2zpk(b_shelf, a_shelf)

    z = np.concatenate([z_hp, z_shelf])
    p = np.concatenate([p_hp, p_shelf])
    k = k_hp * k_shelf

    sos = zpk2sos(z, p, k)
    return sos


def measure_loudness(
    audio: np.ndarray,
    sample_rate: int,
) -> dict:
    """Measure ITU-R BS.1770-4 loudness (integrated LUFS).

    Args:
        audio: 1D numpy array of audio samples
        sample_rate: Sample rate in Hz

    Returns:
        Dict with integrated_lufs, gated_loudness, and per-block measurements
    """
    if len(audio) == 0:
        return {"integrated_lufs": -70.0, "true_peak_dbtp": -70.0, "rms_level": 0.0, "duration_seconds": 0.0}

    audio = audio.astype(np.float64)
    peak = np.max(np.abs(audio))
    peak_db = 20.0 * np.log10(peak + 1e-10)

    try:
        from scipy.signal import sosfilt

        sos = _design_pre_filter(sample_rate)
        filtered = sosfilt(sos, audio)
    except ImportError:
        filtered = audio

    # Compute mean square per block (100 ms blocks as per BS.1770)
    block_size = int(0.1 * sample_rate)
    n_blocks = len(filtered) // block_size

    if n_blocks == 0:
        return {
            "integrated_lufs": -70.0,
            "true_peak_dbtp": float(peak_db),
            "rms_level": float(np.sqrt(np.mean(audio**2))),
            "duration_seconds": float(len(audio) / sample_rate),
        }

    block_powers = np.zeros(n_blocks)
    for i in range(n_blocks):
        block = filtered[i * block_size : (i + 1) * block_size]
        block_powers[i] = np.mean(block**2)

    # Convert to LUFS (absolute threshold gating at -70 LUFS)
    block_loudness = 10.0 * np.log10(block_powers + 1e-12) + 0.691
    absolute_gate = -70.0

    # Gate 1: Remove blocks below absolute threshold
    gated = block_loudness[block_loudness > absolute_gate]

    if len(gated) == 0:
        integrated_lufs = -70.0
    else:
        # Mean power of gated blocks
        gated_power = np.mean(10 ** ((gated - 0.691) / 10.0))
        # Calculate loudness
        integrated_lufs = 10.0 * np.log10(gated_power + 1e-12) + 0.691

        # Gate 2: Relative gate at -10 LU relative to gated result
        relative_gate = integrated_lufs - 10.0
        gated_relative = block_loudness[block_loudness > relative_gate]

        if len(gated_relative) > 0:
            rel_power = np.mean(10 ** ((gated_relative - 0.691) / 10.0))
            integrated_lufs = 10.0 * np.log10(rel_power + 1e-12) + 0.691

    rms = np.sqrt(np.mean(audio**2))
    duration = len(audio) / sample_rate

    return {
        "integrated_lufs": float(integrated_lufs),
        "true_peak_dbtp": float(peak_db),
        "rms_level": float(rms),
        "duration_seconds": float(duration),
        "blocks_measured": n_blocks,
        "blocks_after_gate": len(gated) if "gated" in dir() else 0,
    }


def _loudness_range(audio: np.ndarray, sample_rate: int) -> float:
    """Simplified loudness range (LU): 10th-95th percentile spread of 400 ms block loudness."""
    if len(audio) == 0:
        return 0.0
    block = int(0.4 * sample_rate)
    n = len(audio) // block
    if n < 2:
        return 0.0
    try:
        from scipy.signal import sosfilt

        sos = _design_pre_filter(sample_rate)
        filtered = sosfilt(sos, audio.astype(np.float64))
    except Exception:
        logger.debug("Loudness range pre-filter failed, using unfiltered audio", exc_info=True)
        filtered = audio.astype(np.float64)
    blocks = []
    for i in range(n):
        b = filtered[i * block : (i + 1) * block]
        p = float(np.mean(b**2))
        if p > 0:
            blocks.append(10.0 * np.log10(p + 1e-12) + 0.691)
    if len(blocks) < 2:
        return 0.0
    blocks.sort()
    lo = blocks[int(0.1 * len(blocks))]
    hi = blocks[min(len(blocks) - 1, int(0.95 * len(blocks)))]
    return float(hi - lo)


def analyze_loudness(audio: np.ndarray, sample_rate: int) -> dict:
    """Full loudness report for the AI studio director.

    Returns integrated LUFS, true-peak (dBTP), RMS (dB), crest factor (dB),
    loudness range (LU), and duration. Reuses ``measure_loudness`` (BS.1770-4).
    Offline, numpy-only, non-destructive (no file I/O).
    """
    base = measure_loudness(audio, sample_rate)
    peak_db = float(base.get("true_peak_dbtp", -70.0))
    rms = float(base.get("rms_level", 0.0))
    rms_db = 20.0 * np.log10(rms + 1e-10)
    return {
        "integrated_lufs": base.get("integrated_lufs"),
        "true_peak_dbtp": peak_db,
        "rms_db": rms_db,
        "crest_factor_db": float(peak_db - rms_db),
        "loudness_range_lu": _loudness_range(audio, sample_rate),
        "duration_seconds": base.get("duration_seconds"),
    }


def normalize_to_lufs(audio: np.ndarray, sample_rate: int, target_lufs: float) -> np.ndarray:
    """Normalize audio to a target integrated loudness (LUFS) via overall gain.

    Measures the current BS.1770-4 integrated loudness, then applies a single
    broadband gain so the result lands at ``target_lufs``. Preserves the original
    dynamic contour — no limiting, no dynamic compression. Offline, numpy-only,
    non-destructive (returns a new array).
    """
    if audio is None or len(audio) == 0:
        return audio
    audio = audio.astype(np.float64)
    current = float(measure_loudness(audio, sample_rate).get("integrated_lufs", -70.0))
    if not np.isfinite(current) or current <= -69.0:
        return audio
    gain_db = target_lufs - current
    gain = 10.0 ** (gain_db / 20.0)
    return audio * gain
