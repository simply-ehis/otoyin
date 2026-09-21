"""Audio processing endpoints.

Sidechain ducking, dynamic-range compression, normalization, silence removal,
mastering, loudness analysis, stem separation, and clipboard/edit operations.
Split from :mod:`audio` for maintainability.
"""

import asyncio
import io
import logging
import uuid
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ... import config
from ...errors import ERR_AUDIO_NOT_FOUND, ERR_RATIO_NOT_POSITIVE
from ...utils.async_audio import async_load_audio, async_save_audio

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_audio_path(audio_path: str) -> None:
    """Validate a stored audio path without loading audio data."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)


async def _process_to_export(audio: np.ndarray, sample_rate: int, prefix: str) -> dict:
    """Persist a processed array to the exports dir and return a storage path."""
    output_filename = f"{prefix}_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await async_save_audio(audio, output_path, sample_rate)
    _prune_old_exports()
    return {"output_path": config.to_storage_path(output_path), "filename": output_filename}


def _prune_old_exports(max_age_days: int = 7, max_files_per_call: int = 20) -> None:
    """Best-effort TTL eviction for the exports dir (unbounded growth blocks deploy).

    Deletes ``*.wav`` older than *max_age_days*, capped at *max_files_per_call*
    per invocation so a single request never stalls on cleanup. Never raises.
    """
    try:
        exports = config.get_exports_dir()
        import time

        cutoff = time.time() - max_age_days * 86400
        removed = 0
        for f in exports.glob("*.wav"):
            if removed >= max_files_per_call:
                break
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    removed += 1
            except OSError:
                continue
    except Exception as exc:
        logger.debug("exports prune failed: %s", exc)


# ─── Sidechain / Ducking ─────────────────────────────────────────────────────


def _duck_audio(
    master_audio: np.ndarray,
    sample_rate: int,
    track_audios: dict,
    threshold_db: float,
    ratio: float,
    duck_gain_db: float,
    attack_ms: float,
    release_ms: float,
) -> np.ndarray:
    """Sync ducking core (runs in a worker thread — per-sample gain loop)."""
    threshold = 10 ** (threshold_db / 20)
    duck_gain = 10 ** ((duck_gain_db / ratio) / 20) if ratio else 10 ** (duck_gain_db / 20)
    duck_gain = max(0.0, min(1.0, duck_gain))
    attack_samples = max(1, int(attack_ms * sample_rate / 1000))
    release_samples = max(1, int(release_ms * sample_rate / 1000))

    # Sidechain ducking is driven by the *sidechain* tracks (e.g. a music bed),
    # not by the master's own loudness. Sum the supplied tracks into one
    # trigger envelope; when it exceeds the threshold the master is attenuated.
    # With no tracks the envelope is silent, so gain stays at 1.0 (no ducking).
    sidechain = np.zeros_like(master_audio)
    for audio in track_audios.values():
        aligned = audio[: len(master_audio)]
        if len(aligned) < len(master_audio):
            aligned = np.concatenate([aligned, np.zeros(len(master_audio) - len(aligned), dtype=np.float32)])
        sidechain = sidechain + aligned

    sidechain_envelope = np.abs(sidechain)
    gain = np.ones_like(master_audio)
    current = 1.0
    for i in range(len(master_audio)):
        target = duck_gain if sidechain_envelope[i] > threshold else 1.0
        coeff = 1.0 / attack_samples if target < current else 1.0 / release_samples
        current += (target - current) * coeff
        current = max(duck_gain, min(1.0, current))
        gain[i] = current

    return np.clip(master_audio * gain, -1.0, 1.0)


@router.post("/audio/duck")
async def apply_sidechain_duck(
    audio_path: str,
    track_configs: list[dict],
    threshold_db: float = -30.0,
    ratio: float = 4.0,
    duck_gain_db: float = -12.0,
    attack_ms: float = 5.0,
    release_ms: float = 50.0,
):
    """Apply sidechain ducking to audio for speech enhancement."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    master_audio, sample_rate = await async_load_audio(str(resolved))
    if master_audio.ndim > 1:
        master_audio = master_audio.mean(axis=1)

    track_audios = {}
    for tc in track_configs:
        track_id = tc.get("track_id", "")
        audio_data = tc.get("audio_data", "")
        if not audio_data:
            continue

        import base64
        import binascii

        try:
            raw_bytes = base64.b64decode(audio_data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid base64 audio_data for track '{track_id}': {exc}"
            ) from exc
        buf = io.BytesIO(raw_bytes)
        try:
            track_audio, _ = sf.read(buf, dtype="float32")
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Undecodable audio_data for track '{track_id}': {exc}"
            ) from exc
        if track_audio.ndim > 1:
            track_audio = track_audio.mean(axis=1)
        track_audios[track_id] = track_audio

    ducked_audio = await asyncio.to_thread(
        _duck_audio,
        master_audio,
        sample_rate,
        track_audios,
        threshold_db,
        ratio,
        duck_gain_db,
        attack_ms,
        release_ms,
    )
    ducked_audio = np.clip(ducked_audio, -1.0, 1.0)

    output_filename = f"ducked_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await async_save_audio(ducked_audio, output_path, sample_rate)

    return {"output_path": config.to_storage_path(output_path), "filename": output_filename}


# ─── Silence Removal ─────────────────────────────────────────────────────────


@router.post("/audio/silence-removal")
async def silence_removal_audio(
    audio_path: str,
    threshold_db: float = -40.0,
    min_length_ms: int = 100,
    max_silence_ms: int = 5000,
):
    """Remove silence from audio."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    threshold = 10 ** (threshold_db / 20)
    min_length_samples = int(sample_rate * min_length_ms / 1000)
    max_silence_samples = int(sample_rate * max_silence_ms / 1000)

    energy = np.abs(audio)
    is_silent = energy < threshold

    result: list[np.ndarray] = []
    i = 0
    n = len(audio)
    while i < n:
        if is_silent[i]:
            j = i
            while j < n and is_silent[j]:
                j += 1
            silence_len = j - i
            if silence_len < max_silence_samples and j < n:
                result.append(audio[i:j])
            i = j
        else:
            j = i
            while j < n and not is_silent[j]:
                j += 1
            segment = audio[i:j]
            if len(segment) >= min_length_samples:
                result.append(segment)
            i = j

    if not result:
        return {"output_path": None, "message": "No non-silent audio found"}

    combined = np.concatenate(result)

    output_filename = f"silence_removed_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await async_save_audio(combined, output_path, sample_rate)

    return {"output_path": config.to_storage_path(output_path), "filename": output_filename}


# ─── Compression ──────────────────────────────────────────────────────────────


def _compress_audio(
    audio: np.ndarray,
    sample_rate: int,
    threshold_db: float,
    ratio: float,
    attack_ms: float,
    release_ms: float,
    makeup_gain_db: float,
) -> np.ndarray:
    """Sync compression core (runs in a worker thread — per-sample loops)."""
    threshold = 10 ** (threshold_db / 20)
    attack_samples = max(1, int(attack_ms * sample_rate / 1000))
    release_samples = max(1, int(release_ms * sample_rate / 1000))

    envelope = np.abs(audio)
    compressed = np.zeros_like(audio)

    for i in range(1, len(audio)):
        if envelope[i] > envelope[i - 1]:
            envelope[i] = envelope[i - 1] + (envelope[i] - envelope[i - 1]) * (1 / attack_samples)
        else:
            envelope[i] = envelope[i - 1] + (envelope[i] - envelope[i - 1]) * (1 / release_samples)

    makeup_gain = 10 ** (makeup_gain_db / 20)

    for i in range(len(audio)):
        if envelope[i] > threshold:
            gain_reduction = threshold / (envelope[i] * ratio)
            gain_reduction *= makeup_gain
            compressed[i] = audio[i] * gain_reduction
        else:
            compressed[i] = audio[i] * makeup_gain

    return compressed


@router.post("/audio/compress")
async def compress_audio(
    audio_path: str,
    threshold_db: float = -20.0,
    ratio: float = 4.0,
    attack_ms: float = 10.0,
    release_ms: float = 100.0,
    makeup_gain_db: float = 0.0,
):
    """Apply dynamic range compression to audio."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    if ratio <= 0:
        raise HTTPException(status_code=400, detail=ERR_RATIO_NOT_POSITIVE)

    audio, sample_rate = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    compressed = await asyncio.to_thread(
        _compress_audio, audio, sample_rate, threshold_db, ratio, attack_ms, release_ms, makeup_gain_db
    )

    output_filename = f"compressed_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await async_save_audio(compressed, output_path, sample_rate)

    return {"output_path": config.to_storage_path(output_path), "filename": output_filename}


# ─── Normalization ────────────────────────────────────────────────────────────


@router.post("/audio/normalize")
async def normalize_audio(
    audio_path: str,
    target_db: float = -14.0,
    max_peak_db: float = -3.0,
):
    """Normalize audio to target level with maximum peak control."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    target_level = 10 ** (target_db / 20)
    max_peak = 10 ** (max_peak_db / 20)

    current_peak = np.max(np.abs(audio))

    if current_peak == 0:
        return {"output_path": None, "message": "Silent audio, no normalization applied"}

    gain = target_level / current_peak
    if gain > max_peak / current_peak:
        gain = max_peak / current_peak

    normalized = audio * gain

    output_filename = f"normalized_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await async_save_audio(normalized, output_path, sample_rate)

    return {"output_path": config.to_storage_path(output_path), "filename": output_filename}


# ─── Mastering / Analysis ────────────────────────────────────────────────────


@router.post("/audio/master")
async def master_audio_route(
    audio_path: str,
    target_lufs: float = -14.0,
    true_peak_db: float = -1.0,
    width: float = 0.0,
):
    """Master a finished mix to a broadcast-ready LUFS/true-peak target."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await async_load_audio(str(resolved))
    from ...services.mastering import master_audio

    mastered = master_audio(audio, sample_rate, target_lufs=target_lufs, true_peak_db=true_peak_db, width=width)
    return await _process_to_export(mastered, sample_rate, "mastered")


@router.post("/audio/analyze-loudness")
async def analyze_loudness_route(audio_path: str):
    """Measure loudness of a stored clip: LUFS, true-peak, RMS, crest, LRA."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await async_load_audio(str(resolved))
    from ...services.loudness import analyze_loudness

    return analyze_loudness(audio, sample_rate)


@router.post("/audio/separate")
async def separate_audio_route(
    audio_path: str,
    stem: str = "vocals",
    model_name: str = "htdemucs",
    invert: bool = False,
):
    """Separate one stem (vocals/drums/bass/other) from a mix via Demucs.

    If invert=True, returns the mix minus that stem (e.g. instrumental).
    """
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sample_rate = await async_load_audio(str(resolved))
    from ...services.stem_separation import separate_audio

    try:
        separated = separate_audio(
            audio,
            sample_rate,
            stem=stem,
            model_name=model_name,
            invert=invert,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return await _process_to_export(separated, sample_rate, f"separated_{stem}")


# ─── Editing primitives ──────────────────────────────────────────────────────


@router.post("/audio/copy")
async def copy_segment_route(audio_path: str, start_s: float = 0.0, end_s: float = 0.0):
    """Copy a region into the clipboard; source is untouched."""
    _validate_audio_path(audio_path)
    resolved = config.resolve_storage_path(audio_path)
    from ...services.audio_edit import copy_segment

    return copy_segment(str(resolved), float(start_s), float(end_s))


@router.post("/audio/cut")
async def cut_segment_route(audio_path: str, start_s: float = 0.0, end_s: float = 0.0):
    """Cut a region out of the audio; returns the shortened file + the extracted clip."""
    _validate_audio_path(audio_path)
    resolved = config.resolve_storage_path(audio_path)
    from ...services.audio_edit import cut_segment

    return cut_segment(str(resolved), float(start_s), float(end_s))


@router.post("/audio/paste")
async def paste_segment_route(
    target_path: str,
    clip_path: str,
    at_s: float = 0.0,
    crossfade_ms: float = 0.0,
):
    """Insert clip into target at at_s (optional crossfade)."""
    _validate_audio_path(target_path)
    _validate_audio_path(clip_path)
    tgt = config.resolve_storage_path(target_path)
    clip = config.resolve_storage_path(clip_path)
    from ...services.audio_edit import paste_segment

    return paste_segment(str(tgt), str(clip), float(at_s), float(crossfade_ms))


@router.post("/audio/time-stretch")
async def time_stretch_route(audio_path: str, rate: float = 1.0):
    """Stretch duration by rate at constant pitch."""
    _validate_audio_path(audio_path)
    resolved = config.resolve_storage_path(audio_path)
    from ...services.audio_edit import time_stretch

    return time_stretch(str(resolved), float(rate))


@router.post("/audio/shout-to-whisper")
async def shout_to_whisper_route(audio_path: str, intensity: float = 0.7):
    """Soften a projected/sharp take into a close, breathy whisper-like delivery."""
    _validate_audio_path(audio_path)
    resolved = config.resolve_storage_path(audio_path)
    from ...services.audio_edit import shout_to_whisper

    return shout_to_whisper(str(resolved), float(intensity))


@router.post("/audio/blend")
async def blend_route(
    audio_path_a: str,
    audio_path_b: str,
    crossfade_ms: float = 200.0,
    gap_ms: float = 0.0,
    curve: str = "equal_power",
):
    """Crossfade-merge clip B after clip A into one file."""
    _validate_audio_path(audio_path_a)
    _validate_audio_path(audio_path_b)
    a = config.resolve_storage_path(audio_path_a)
    b = config.resolve_storage_path(audio_path_b)
    from ...services.audio_edit import blend

    return blend(str(a), str(b), float(crossfade_ms), float(gap_ms), curve)


# ─── EQ (4-band parametric) ──────────────────────────────────────────────────


class EQRequest(BaseModel):
    audio_path: str
    # 4-band parametric
    low_freq: float = 100.0
    low_gain_db: float = 0.0
    low_q: float = 0.707
    mid1_freq: float = 1000.0
    mid1_gain_db: float = 0.0
    mid1_q: float = 1.0
    mid2_freq: float = 3000.0
    mid2_gain_db: float = 0.0
    mid2_q: float = 1.0
    high_freq: float = 8000.0
    high_gain_db: float = 0.0
    high_q: float = 0.707
    preamp_db: float = 0.0
    # Legacy 3-band fallback
    legacy_low_gain_db: float | None = None
    legacy_mid_gain_db: float | None = None
    legacy_high_gain_db: float | None = None
    legacy_low_cutoff_hz: float | None = None
    legacy_high_cutoff_hz: float | None = None


@router.post("/audio/eq")
async def eq_audio_route(data: EQRequest):
    """Apply 4-band parametric EQ (lowshelf + 2 peaking + highshelf).

    Falls back to legacy 3-band if legacy fields are provided.
    """
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    audio = audio.astype(np.float32)

    # Preamp
    if abs(data.preamp_db) > 0.01:
        audio = audio * (10 ** (data.preamp_db / 20.0))

    from ...services.effects import apply_eq

    params: dict = {}
    # Use legacy fields if provided, else use parametric fields
    if data.legacy_low_gain_db is not None:
        params["low_freq"] = data.legacy_low_cutoff_hz or 200.0
        params["low_gain"] = data.legacy_low_gain_db
        params["low_q"] = 0.707
    else:
        params["low_freq"] = data.low_freq
        params["low_gain"] = data.low_gain_db
        params["low_q"] = data.low_q

    if data.legacy_mid_gain_db is not None:
        params["mid1_freq"] = 2650.0
        params["mid1_gain"] = data.legacy_mid_gain_db
        params["mid1_q"] = 0.7
    else:
        params["mid1_freq"] = data.mid1_freq
        params["mid1_gain"] = data.mid1_gain_db
        params["mid1_q"] = data.mid1_q

    params["mid2_freq"] = data.mid2_freq
    params["mid2_gain"] = data.mid2_gain_db
    params["mid2_q"] = data.mid2_q

    if data.legacy_high_gain_db is not None:
        params["high_freq"] = data.legacy_high_cutoff_hz or 5000.0
        params["high_gain"] = data.legacy_high_gain_db
        params["high_q"] = 0.707
    else:
        params["high_freq"] = data.high_freq
        params["high_gain"] = data.high_gain_db
        params["high_q"] = data.high_q

    processed = apply_eq(audio, sr, params)
    processed = np.clip(processed, -1.0, 1.0)

    return await _process_to_export(processed, sr, "eq")


# ─── Reverb ──────────────────────────────────────────────────────────────────


class ReverbRequest(BaseModel):
    audio_path: str
    room_size: float = 0.5
    damping: float = 0.5
    wet_level: float = 0.3
    dry_level: float = 0.7
    width: float = 1.0
    freeze_mode: float = 0.0


@router.post("/audio/reverb")
async def reverb_audio_route(data: ReverbRequest):
    """Apply room reverb with adjustable size, damping, and wet/dry mix."""
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    from ...services.effects import apply_reverb

    processed = await asyncio.to_thread(
        apply_reverb,
        audio.astype(np.float32),
        sr,
        {
            "room_size": float(data.room_size),
            "damping": float(data.damping),
            "wet_level": float(data.wet_level),
            "dry_level": float(data.dry_level),
            "width": float(data.width),
            "freeze_mode": float(data.freeze_mode),
        },
    )

    return await _process_to_export(processed, sr, "reverb")


# ─── Effect Chain (apply multiple effects at once) ──────────────────────────


class EffectChainItem(BaseModel):
    effect_type: str
    enabled: bool = True
    params: dict[str, Any] = {}


class EffectChainRequest(BaseModel):
    audio_path: str
    effects: list[EffectChainItem]
    parallel: bool = False


@router.post("/audio/effect-chain")
async def apply_effect_chain_route(data: EffectChainRequest):
    """Apply a chain of effects in sequence (or parallel if requested)."""
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    from ...services.effects import EffectConfig, apply_effects_chain

    chain = [
        EffectConfig(
            effect_type=e.effect_type,
            enabled=e.enabled,
            params=e.params,
        )
        for e in data.effects
    ]

    try:
        processed = await asyncio.to_thread(apply_effects_chain, audio.astype(np.float32), sr, chain)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await _process_to_export(processed, sr, "chain")
