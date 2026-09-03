"""Breath and pause control for TTS output.

Synthesizes natural breath sounds and controls pause duration at
punctuation boundaries. Can also use pre-recorded breath samples
when available (online or locally cached).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

# Pre-recorded breath sample directory (populated by download script or user)
_BREATH_SAMPLES_DIR = Path(__file__).parent.parent.parent / "data" / "breath_samples"


def _generate_breath(
    duration_ms: float,
    sample_rate: int,
    intensity: float = 0.5,
) -> np.ndarray:
    """Synthesize a natural-sounding breath sound.

    Uses filtered noise with amplitude envelope shaped like an inhalation.
    ``intensity`` 0.0 = barely audible, 1.0 = full deep breath.
    """
    n_samples = int(sample_rate * duration_ms / 1000.0)
    if n_samples < 1:
        return np.array([], dtype=np.float32)

    # Base noise
    rng = np.random.default_rng()
    noise = rng.standard_normal(n_samples).astype(np.float32)

    # Bandpass filter: breath energy lives in 500-6000 Hz
    from scipy.signal import butter, sosfilt

    low = 400.0 + intensity * 200.0
    high = 4000.0 + intensity * 2000.0
    sos = butter(2, [low / (sample_rate / 2), min(high / (sample_rate / 2), 0.99)], btype="band")
    filtered = sosfilt(sos, noise)

    # Amplitude envelope: ramp up, sustain, ramp down (inhalation shape)
    attack = int(n_samples * 0.15)
    release = int(n_samples * 0.35)
    sustain = n_samples - attack - release

    envelope = np.concatenate(
        [
            np.linspace(0.0, 1.0, attack, dtype=np.float32),
            np.ones(sustain, dtype=np.float32) * (0.6 + 0.4 * intensity),
            np.linspace(1.0, 0.0, release, dtype=np.float32),
        ]
    )
    envelope = envelope[:n_samples]

    # Apply envelope
    breath = filtered * envelope * intensity * 0.3

    # Gentle fade in/out to avoid clicks
    fade_samples = min(int(sample_rate * 0.005), n_samples // 4)
    if fade_samples > 0:
        fade_in = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
        fade_out = np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)
        breath[:fade_samples] *= fade_in
        breath[-fade_samples:] *= fade_out

    return np.clip(breath, -1.0, 1.0).astype(np.float32)


def _load_prepared_breath(duration_ms: float, sample_rate: int) -> np.ndarray | None:
    """Try to load a pre-recorded breath sample that matches the duration.

    Searches for WAV files named like ``breath_300ms.wav`` in the breath
    samples directory. Returns None if no match is found.
    """
    if not _BREATH_SAMPLES_DIR.exists():
        return None

    target_s = duration_ms / 1000.0
    best_match = None
    best_diff = float("inf")

    for f in _BREATH_SAMPLES_DIR.glob("*.wav"):
        name = f.stem.lower()
        # Parse duration from filename like "breath_300ms" or "breath_0.3s"
        try:
            if "ms" in name:
                file_ms = float(name.split("_")[-1].replace("ms", ""))
                file_s = file_ms / 1000.0
            elif "s" in name:
                file_s = float(name.split("_")[-1].replace("s", ""))
            else:
                continue
        except (ValueError, IndexError):
            continue

        diff = abs(file_s - target_s)
        if diff < best_diff:
            best_diff = diff
            best_match = f

    if best_match is None or best_diff > 0.1:
        return None

    try:
        import soundfile as sf

        audio, sr = sf.read(str(best_match), dtype="float32")
        if sr != sample_rate:
            from scipy.signal import resample

            audio = resample(audio, int(len(audio) * sample_rate / sr))
        return audio.astype(np.float32)
    except Exception:
        return None


def _detect_pauses(
    audio: np.ndarray,
    sample_rate: int,
    threshold_db: float = -40.0,
    min_pause_ms: float = 150.0,
) -> list[dict]:
    """Detect silence gaps in audio that could be pause points.

    Returns list of dicts with ``start_ms``, ``end_ms``, ``duration_ms``.
    """
    threshold = 10.0 ** (threshold_db / 20.0)
    min_pause_samples = int(sample_rate * min_pause_ms / 1000.0)

    is_silent = np.abs(audio) < threshold
    pauses = []
    in_pause = False
    start = 0

    for i in range(len(audio)):
        if is_silent[i] and not in_pause:
            in_pause = True
            start = i
        elif not is_silent[i] and in_pause:
            in_pause = False
            duration = i - start
            if duration >= min_pause_samples:
                pauses.append(
                    {
                        "start_ms": round(start / sample_rate * 1000, 1),
                        "end_ms": round(i / sample_rate * 1000, 1),
                        "duration_ms": round(duration / sample_rate * 1000, 1),
                    }
                )

    return pauses


def insert_breaths(
    audio: np.ndarray,
    sample_rate: int,
    breath_intensity: float = 0.5,
    pause_multiplier: float = 1.0,
    text: str | None = None,
    use_prepared: bool = True,
) -> np.ndarray:
    """Insert breath sounds at detected pause points.

    ``breath_intensity``  0.0 = no breaths, 1.0 = full natural breaths.
    ``pause_multiplier``  scales pause duration (1.0 = keep as-is, 2.0 = double).
    ``text``             optional text alignment for punctuation-aware pauses.
    ``use_prepared``     try pre-recorded samples before synthesizing.
    """
    if breath_intensity <= 0.0:
        return audio

    pauses = _detect_pauses(audio, sample_rate)
    if not pauses:
        return audio

    # Build output by inserting breaths at pause points (work backwards to
    # preserve indices).
    result = audio.copy()
    offset = 0

    for pause in pauses:
        start_idx = int((pause["start_ms"] / 1000.0) * sample_rate) + offset
        end_idx = int((pause["end_ms"] / 1000.0) * sample_rate) + offset
        pause_duration_ms = pause["duration_ms"]

        # Scale pause
        new_pause_ms = pause_duration_ms * pause_multiplier
        extra_samples = int((new_pause_ms - pause_duration_ms) / 1000.0 * sample_rate)

        # Generate or load breath
        breath_duration_ms = min(new_pause_ms * 0.7, 400.0)
        breath = None

        if use_prepared:
            breath = _load_prepared_breath(breath_duration_ms, sample_rate)

        if breath is None:
            breath = _generate_breath(breath_duration_ms, sample_rate, breath_intensity)

        # Insert breath centered in the pause region
        breath_center = (start_idx + end_idx) // 2
        insert_start = max(0, breath_center - len(breath) // 2)

        # Pad or trim breath to fit
        target_len = len(breath)
        if insert_start + target_len > len(result):
            target_len = len(result) - insert_start
            breath = breath[:target_len]

        if target_len > 0:
            # Mix breath into the silence region
            result[insert_start : insert_start + target_len] += breath * breath_intensity

        # Add extra silence if pause_multiplier > 1
        if extra_samples > 0:
            silence = np.zeros(extra_samples, dtype=np.float32)
            result = np.concatenate(
                [
                    result[:end_idx],
                    silence,
                    result[end_idx:],
                ]
            )
            offset += extra_samples

    return np.clip(result, -1.0, 1.0).astype(np.float32)


def adjust_pauses(
    audio: np.ndarray,
    sample_rate: int,
    min_pause_ms: float = 200.0,
    max_pause_ms: float = 1500.0,
    target_pause_ms: float | None = None,
) -> np.ndarray:
    """Adjust pause durations in audio.

    If ``target_pause_ms`` is set, all pauses become that duration.
    Otherwise, pauses shorter than ``min_pause_ms`` are extended,
    and pauses longer than ``max_pause_ms`` are trimmed.
    """
    pauses = _detect_pauses(audio, sample_rate, min_pause_ms=50.0)
    if not pauses:
        return audio

    result = audio.copy()
    offset = 0

    for pause in pauses:
        start_idx = int((pause["start_ms"] / 1000.0) * sample_rate) + offset
        end_idx = int((pause["end_ms"] / 1000.0) * sample_rate) + offset
        current_ms = pause["duration_ms"]

        if target_pause_ms is not None:
            desired_ms = target_pause_ms
        elif current_ms < min_pause_ms:
            desired_ms = min_pause_ms
        elif current_ms > max_pause_ms:
            desired_ms = max_pause_ms
        else:
            continue

        delta_ms = desired_ms - current_ms
        delta_samples = int(delta_ms / 1000.0 * sample_rate)

        if delta_samples > 0:
            # Extend: insert silence
            silence = np.zeros(delta_samples, dtype=np.float32)
            result = np.concatenate(
                [
                    result[:end_idx],
                    silence,
                    result[end_idx:],
                ]
            )
            offset += delta_samples
        elif delta_samples < 0:
            # Trim: remove samples from the pause region
            trim = min(abs(delta_samples), end_idx - start_idx)
            result = np.concatenate(
                [
                    result[:start_idx],
                    result[start_idx + trim :],
                ]
            )
            offset -= trim

    return np.clip(result, -1.0, 1.0).astype(np.float32)
