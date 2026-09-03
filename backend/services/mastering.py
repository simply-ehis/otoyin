import logging

import numpy as np

from .loudness import measure_loudness

logger = logging.getLogger(__name__)


def _downmix_mono(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return audio
    return np.mean(audio, axis=1)


def _measure_integrated_lufs(audio: np.ndarray, sample_rate: int) -> float:
    mono = _downmix_mono(audio).astype(np.float32)
    try:
        return float(measure_loudness(mono, sample_rate).get("integrated_lufs", -70.0))
    except Exception:
        logger.debug("measure_loudness failed, using RMS fallback", exc_info=True)
        peak = np.max(np.abs(mono)) + 1e-9
        return float(10.0 * np.log10(np.mean(mono**2) / (peak**2) + 1e-12))


def _broadband_compressor(
    audio: np.ndarray,
    sample_rate: int,
    threshold_db: float = -18.0,
    ratio: float = 2.0,
    attack: float = 0.005,
    release: float = 0.12,
) -> np.ndarray:
    threshold = 10 ** (threshold_db / 20.0)
    attack_coef = np.exp(-1.0 / (max(attack, 1e-4) * sample_rate))
    release_coef = np.exp(-1.0 / (max(release, 1e-4) * sample_rate))
    out = np.empty_like(audio)
    for c in range(audio.shape[1]):
        ch = audio[:, c]
        env = np.zeros(len(ch), dtype=np.float64)
        prev = 0.0
        for i in range(len(ch)):
            level = abs(float(ch[i]))
            coef = attack_coef if level > prev else release_coef
            prev = level + coef * (prev - level)
            env[i] = prev
        gain = np.ones(len(ch), dtype=np.float64)
        mask = env > threshold
        if np.any(mask):
            over = env[mask] / threshold
            gain_db = (1.0 - 1.0 / ratio) * 20.0 * np.log10(over + 1e-12)
            gain[mask] = 10 ** (gain_db / 20.0)
        out[:, c] = np.clip(ch * gain, -1.0, 1.0)
    return out.astype(np.float32)


def _true_peak_limiter(audio: np.ndarray, ceiling_db: float = -1.0, oversample: int = 4) -> np.ndarray:
    ceiling = 10 ** (ceiling_db / 20.0)
    out = np.empty_like(audio)
    for c in range(audio.shape[1]):
        ch = audio[:, c]
        n = len(ch)
        if oversample > 1:
            x = np.interp(np.linspace(0, n - 1, n * oversample), np.arange(n), ch)
            peak = np.max(np.abs(x)) + 1e-12
            if peak > ceiling:
                x = x * (ceiling / peak)
            ch = x[::oversample]
        peak = np.max(np.abs(ch)) + 1e-12
        if peak > ceiling:
            ch = ch * (ceiling / peak)
        out[:, c] = np.clip(ch, -1.0, 1.0)
    return out.astype(np.float32)


def _stereo_widener(audio: np.ndarray, width: float) -> np.ndarray:
    if audio.ndim != 2 or audio.shape[1] < 2:
        return audio
    mid = (audio[:, 0] + audio[:, 1]) / 2.0
    side = (audio[:, 0] - audio[:, 1]) / 2.0
    w = min(max(width, -1.0), 1.0)
    side = side * (1.0 + w)
    left = mid + side
    right = mid - side
    out = np.stack([left, right], axis=1)
    return np.clip(out, -1.0, 1.0).astype(np.float32)


def master_audio(
    audio: np.ndarray, sample_rate: int, target_lufs: float = -14.0, true_peak_db: float = -1.0, width: float = 0.0
) -> np.ndarray:
    """Master a finished mix to a broadcast-ready, offline stereo/mono target.

    Pipeline: broadband glue compressor -> true-peak limiter -> LUFS normalize
    to target -> optional stereo widener. Non-destructive: returns a new array.
    """
    if len(audio) == 0:
        return audio
    audio = np.asarray(audio, dtype=np.float64)
    if audio.ndim == 1:
        audio = audio.reshape(-1, 1)

    audio = _broadband_compressor(audio, sample_rate)
    audio = _true_peak_limiter(audio, ceiling_db=true_peak_db)

    integrated = _measure_integrated_lufs(audio, sample_rate)
    if integrated > -69.0:
        gain_db = target_lufs - integrated
        audio = audio * (10 ** (gain_db / 20.0))

    audio = _true_peak_limiter(audio, ceiling_db=true_peak_db)

    if width != 0.0 and audio.shape[1] >= 2:
        audio = _stereo_widener(audio, width)

    if audio.shape[1] == 1:
        audio = audio[:, 0]
    return np.clip(audio.astype(np.float32), -1.0, 1.0)
