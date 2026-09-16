"""Standalone audio editing primitives (non-DAW).

These operate on raw WAV paths and return a new WAV path. They back both the
human-facing frontend editing tools and the assistant agent tools, so the same
DSP runs whether a person clicks a button or the LLM calls a tool.

Operations:
  * copy/cut/paste clipboard  — extract, remove, and re-insert segments
  * time_stretch             — change duration without changing pitch (expand/compress)
  * shout_to_whisper         — soften a loud/sharp take into a close, breathy one
  * blend                    — crossfade-merge two clips into one
"""

from __future__ import annotations

import uuid

import numpy as np

from .. import config
from ..utils.audio import load_audio, save_audio
from .effects import apply_formant_shift, apply_time_stretch


def _resolve(path: str) -> str:
    """Resolve a storage path/relative/absolute path to a loadable file path."""
    resolved = config.resolve_storage_path(path)
    return str(resolved) if resolved is not None else path


class AudioEditError(Exception):
    """Raised when an audio editing operation cannot complete due to invalid input."""


def _basename(path: str) -> str:
    """Separator-agnostic basename (storage paths use backslashes on Windows)."""
    return path.replace("\\", "/").split("/")[-1]


def _load_mono(audio_path: str) -> tuple[np.ndarray, int]:
    """Load audio normalized to mono float32 for segment math."""
    try:
        audio, sample_rate = load_audio(_resolve(audio_path))
    except Exception as e:
        raise AudioEditError(f"Cannot load audio file: {audio_path}") from e
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio.astype(np.float32), sample_rate


def _seconds_to_samples(seconds: float, sample_rate: int) -> int:
    return max(0, round(seconds * sample_rate))


def _save_output(audio: np.ndarray, sample_rate: int, suffix: str) -> str:
    exports_dir = config.get_exports_dir()
    exports_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{suffix}_{uuid.uuid4().hex[:12]}.wav"
    out_path = exports_dir / filename
    save_audio(audio, str(out_path), sample_rate)
    return str(config.to_storage_path(out_path))


# ─── Clipboard ───────────────────────────────────────────────────────────────


def copy_segment(audio_path: str, start_s: float, end_s: float) -> dict:
    """Extract ``[start_s, end_s)`` into the process clipboard; returns metadata.

    Non-destructive: the source file is left untouched. The extracted clip is
    written to the exports dir and its path + length are returned for paste.
    """
    if start_s >= end_s:
        raise AudioEditError("start_s must be less than end_s")
    audio, sample_rate = _load_mono(audio_path)
    total = len(audio) / sample_rate
    start = max(0.0, min(start_s, total))
    end = max(start, min(end_s, total))
    s0 = _seconds_to_samples(start, sample_rate)
    s1 = _seconds_to_samples(end, sample_rate)
    clip = audio[s0:s1]
    out_path = _save_output(clip, sample_rate, "clip")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(clip) / sample_rate, 4),
        "sample_rate": sample_rate,
    }


def cut_segment(audio_path: str, start_s: float, end_s: float) -> dict:
    """Remove ``[start_s, end_s)`` from the audio and return the shortened file.

    The removed region is also written as a separate clip so it can be pasted
    elsewhere (a real cut, not a delete).
    """
    if start_s >= end_s:
        raise AudioEditError("start_s must be less than end_s")
    audio, sample_rate = _load_mono(audio_path)
    total = len(audio) / sample_rate
    start = max(0.0, min(start_s, total))
    end = max(start, min(end_s, total))
    s0 = _seconds_to_samples(start, sample_rate)
    s1 = _seconds_to_samples(end, sample_rate)
    clip = audio[s0:s1]
    remainder = np.concatenate([audio[:s0], audio[s1:]]) if s1 > s0 else audio
    clip_path = _save_output(clip, sample_rate, "clip")
    remain_path = _save_output(remainder, sample_rate, "cut")
    return {
        "output_path": remain_path,
        "filename": _basename(remain_path),
        "clip_path": clip_path,
        "duration_s": round(len(remainder) / sample_rate, 4),
        "clip_duration_s": round(len(clip) / sample_rate, 4),
        "sample_rate": sample_rate,
    }


def paste_segment(target_path: str, clip_path: str, at_s: float, crossfade_ms: float = 0.0) -> dict:
    """Insert ``clip_path`` into ``target_path`` at ``at_s``.

    With ``crossfade_ms > 0`` the inserted clip is equal-power crossfaded with
    the surrounding material so the splice is seamless; otherwise it is a clean
    insert (a short gap-free join). Returns the merged file path.
    """
    target, sr_t = _load_mono(target_path)
    clip, sr_c = _load_mono(clip_path)
    if len(clip) == 0:
        raise AudioEditError("clip is empty, nothing to paste")
    if sr_t != sr_c:
        clip = _resample(clip, sr_c, sr_t)
    total = len(target) / sr_t
    at = max(0.0, min(at_s, total))
    s0 = _seconds_to_samples(at, sr_t)
    cf = max(0, int(crossfade_ms / 1000.0 * sr_t))
    if cf > 0 and s0 > 0 and s0 <= len(target):
        cf = min(cf, s0, len(clip))
        head = target[: s0 - cf].astype(np.float32)
        tail = target[s0:].astype(np.float32)
        taper_out = np.linspace(1.0, 0.0, cf)
        taper_in = np.linspace(0.0, 1.0, cf)
        cross = target[s0 - cf : s0] * taper_out + clip[:cf] * taper_in
        merged = np.concatenate([head, cross, clip[cf:], tail])
    else:
        merged = np.concatenate([target[:s0], clip, target[s0:]])
    out_path = _save_output(merged, sr_t, "paste")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(merged) / sr_t, 4),
        "sample_rate": sr_t,
    }


def _resample(audio: np.ndarray, sr: int, target_sr: int) -> np.ndarray:
    """Minimal linear-resample; scipy/soundfile resample is heavier than needed."""
    if sr == target_sr:
        return audio
    indices = np.linspace(0, len(audio) - 1, round(len(audio) * target_sr / sr))
    return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)


# ─── Time stretch / expand ───────────────────────────────────────────────────


def time_stretch(audio_path: str, rate: float) -> dict:
    """Stretch duration by ``rate`` at constant pitch.

    ``rate > 1`` expands (slower/longer), ``rate < 1`` compresses (faster/shorter).
    """
    rate = max(0.25, min(4.0, float(rate)))
    audio, sample_rate = _load_mono(audio_path)
    if rate == 1.0:
        out_path = _save_output(audio, sample_rate, "stretch")
        return {
            "output_path": out_path,
            "filename": _basename(out_path),
            "rate": 1.0,
            "duration_s": round(len(audio) / sample_rate, 4),
            "sample_rate": sample_rate,
        }
    stretched = apply_time_stretch(audio, sample_rate, {"factor": rate})
    out_path = _save_output(stretched.astype(np.float32), sample_rate, "stretch")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "rate": rate,
        "duration_s": round(len(stretched) / sample_rate, 4),
        "sample_rate": sample_rate,
    }


# ─── Shout → whisper ────────────────────────────────────────────────────────


def shout_to_whisper(audio_path: str, intensity: float = 0.7) -> dict:
    """Soften a loud, sharp take into a close, breathy whisper-like delivery.

    Combines three perceptually-coupled transforms:
      1. formant shift down (``shift_factor < 1``) — smaller vocal cavities,
         the core "shout → intimate" cue;
      2. high-frequency attenuation — a smooth spectral tilt that removes the
         harsh sibilance/sharpness of a projected voice;
      3. dynamic de-emphasis — a gentle downward gain curve so loud onsets are
         pulled down toward the quieter body, mimicking a controlled whisper.
    ``intensity`` in ``[0, 1]`` scales how far each transform is pushed.
    """
    intensity = max(0.0, min(1.0, float(intensity)))
    audio, sample_rate = _load_mono(audio_path)
    if intensity == 0.0:
        out_path = _save_output(audio, sample_rate, "whisper")
        return {
            "output_path": out_path,
            "filename": _basename(out_path),
            "intensity": 0.0,
            "duration_s": round(len(audio) / sample_rate, 4),
            "sample_rate": sample_rate,
        }

    # 1. Formant shift down — more intimate resonance.
    formant = 1.0 - 0.35 * intensity
    audio = apply_formant_shift(audio, sample_rate, {"shift_factor": formant})

    # 2. Spectral tilt: one-pole low-pass-ish smoothing that attenuates highs.
    cutoff = 9000.0 - 5500.0 * intensity
    rc = 1.0 / (2.0 * np.pi * max(500.0, cutoff))
    dt = 1.0 / sample_rate
    alpha = dt / (rc + dt)
    smoothed = np.zeros_like(audio)
    prev = float(audio[0]) if len(audio) > 0 else 0.0
    for i in range(len(audio)):
        prev = prev + alpha * (audio[i] - prev)
        smoothed[i] = prev
    # Blend the original with the darkened copy so we tame, not kill, the highs.
    tilt = audio * (1.0 - 0.6 * intensity) + smoothed * (0.6 * intensity)

    # 3. Dynamic de-emphasis: pull peaks down toward RMS (controlled whisper).
    rms = float(np.sqrt(np.mean(tilt**2))) + 1e-8
    ceiling = rms * (1.0 + 6.0 * (1.0 - intensity))  # higher ceiling when softer
    gain = np.minimum(1.0, ceiling / np.maximum(np.abs(tilt), 1e-8))
    deemph = tilt * gain

    out = np.clip(deemph, -1.0, 1.0).astype(np.float32)
    out_path = _save_output(out, sample_rate, "whisper")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "intensity": intensity,
        "duration_s": round(len(out) / sample_rate, 4),
        "sample_rate": sample_rate,
    }


# ─── Blend / crossfade-merge ────────────────────────────────────────────────


def blend(
    audio_path_a: str, audio_path_b: str, crossfade_ms: float = 200.0, gap_ms: float = 0.0, curve: str = "equal_power"
) -> dict:
    """Crossfade-merge clip B after clip A into a single file.

    With ``gap_ms > 0`` the clips are separated by silence before the join;
    otherwise B starts exactly at A's end and the two overlap by ``crossfade_ms``.

    ``curve`` selects the crossfade shape:
      - "equal_power" (default): smooth, no level dip at the center
      - "linear": simple 50/50 blend (may dip slightly)
      - "exponential": quick fade, more of A then sudden B
    """
    a, sr_a = _load_mono(audio_path_a)
    b, sr_b = _load_mono(audio_path_b)
    if sr_a != sr_b:
        b = _resample(b, sr_b, sr_a)
    sr = sr_a
    cf = max(0, int(crossfade_ms / 1000.0 * sr))
    gap = max(0, int(gap_ms / 1000.0 * sr))

    if gap > 0:
        a = np.concatenate([a, np.zeros(gap, dtype=np.float32)])

    if cf <= 0:
        merged = np.concatenate([a, b])
    else:
        cf = min(cf, len(a), len(b))
        overlap_a = a[-cf:]
        overlap_b = b[:cf]
        t = np.linspace(0.0, 1.0, cf, dtype=np.float32)

        if curve == "linear":
            taper_a = 1.0 - t
            taper_b = t
        elif curve == "exponential":
            taper_a = (1.0 - t) ** 2
            taper_b = t**2
        else:
            # Equal-power: sin/cos taper (constant energy through the crossfade)
            taper_a = np.cos(t * np.pi / 2).astype(np.float32)
            taper_b = np.sin(t * np.pi / 2).astype(np.float32)

        cross = overlap_a * taper_a + overlap_b * taper_b
        merged = np.concatenate([a[:-cf], cross, b[cf:]])

    out_path = _save_output(merged.astype(np.float32), sr, "blend")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(merged) / sr, 4),
        "sample_rate": sr,
    }


# ─── Inline editing primitives ──────────────────────────────────────────────


def fade_in(audio_path: str, duration_ms: float = 100.0, start_ms: float = 0.0) -> dict:
    """Apply a fade-in starting at ``start_ms`` for ``duration_ms``."""
    audio, sr = _load_mono(audio_path)
    start = _seconds_to_samples(start_ms / 1000.0, sr)
    start = max(0, min(start, len(audio)))
    n_fade = _seconds_to_samples(duration_ms / 1000.0, sr)
    n_fade = min(n_fade, len(audio) - start)
    if n_fade < 1:
        return {
            "output_path": audio_path,
            "filename": _basename(audio_path),
            "duration_s": round(len(audio) / sr, 4),
            "sample_rate": sr,
        }
    fade_curve = np.linspace(0.0, 1.0, n_fade, dtype=np.float32)
    audio[start : start + n_fade] *= fade_curve
    out_path = _save_output(audio, sr, "fadein")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(audio) / sr, 4),
        "sample_rate": sr,
    }


def fade_out(audio_path: str, duration_ms: float = 100.0, start_ms: float | None = None) -> dict:
    """Apply a fade-out. If ``start_ms`` is given, fade ends at ``start_ms + duration_ms``; otherwise fades the tail."""
    audio, sr = _load_mono(audio_path)
    if start_ms is not None:
        end = _seconds_to_samples((start_ms + duration_ms) / 1000.0, sr)
    else:
        end = len(audio)
    end = max(0, min(end, len(audio)))
    n_fade = _seconds_to_samples(duration_ms / 1000.0, sr)
    n_fade = min(n_fade, end)
    if n_fade < 1:
        return {
            "output_path": audio_path,
            "filename": _basename(audio_path),
            "duration_s": round(len(audio) / sr, 4),
            "sample_rate": sr,
        }
    fade_curve = np.linspace(1.0, 0.0, n_fade, dtype=np.float32)
    audio[end - n_fade : end] *= fade_curve
    out_path = _save_output(audio, sr, "fadeout")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(audio) / sr, 4),
        "sample_rate": sr,
    }


def splice(audio_path: str, start_ms: float, end_ms: float) -> dict:
    """Keep only the region between start_ms and end_ms (trim the rest)."""
    audio, sr = _load_mono(audio_path)
    s0 = _seconds_to_samples(start_ms / 1000.0, sr)
    s1 = _seconds_to_samples(end_ms / 1000.0, sr)
    s0 = max(0, min(s0, len(audio)))
    s1 = max(s0, min(s1, len(audio)))
    trimmed = audio[s0:s1]
    out_path = _save_output(trimmed, sr, "splice")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(trimmed) / sr, 4),
        "sample_rate": sr,
    }


def delete_region(audio_path: str, start_ms: float, end_ms: float) -> dict:
    """Remove the region between start_ms and end_ms."""
    audio, sr = _load_mono(audio_path)
    s0 = _seconds_to_samples(start_ms / 1000.0, sr)
    s1 = _seconds_to_samples(end_ms / 1000.0, sr)
    s0 = max(0, min(s0, len(audio)))
    s1 = max(s0, min(s1, len(audio)))
    result = np.concatenate([audio[:s0], audio[s1:]])
    out_path = _save_output(result, sr, "delete")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(result) / sr, 4),
        "sample_rate": sr,
    }


def insert_silence(audio_path: str, position_ms: float, duration_ms: float) -> dict:
    """Insert silence at the given position."""
    audio, sr = _load_mono(audio_path)
    pos = _seconds_to_samples(position_ms / 1000.0, sr)
    pos = max(0, min(pos, len(audio)))
    silence = np.zeros(_seconds_to_samples(duration_ms / 1000.0, sr), dtype=np.float32)
    result = np.concatenate([audio[:pos], silence, audio[pos:]])
    out_path = _save_output(result, sr, "silence")
    return {
        "output_path": out_path,
        "filename": _basename(out_path),
        "duration_s": round(len(result) / sr, 4),
        "sample_rate": sr,
    }
