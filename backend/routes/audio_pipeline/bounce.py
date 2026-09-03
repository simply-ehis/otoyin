"""Bounce/mix core and export file serving.

This module contains the track-bounce pipeline (models, helpers, endpoints)
and the /exports/{filename} serve route.  Audio-processing and audio-effects
endpoints have been split into :mod:`audio_processing` and :mod:`audio_effects`
for maintainability.
"""

import asyncio
import io
import logging
import math
import os
import uuid

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ... import config
from ...errors import ERR_AUDIO_NOT_FOUND, ERR_INVALID_FILENAME, ERR_NO_AUDIO_DATA
from ...services.effects_chain import EffectConfig, apply_effects_chain
from ...services.instruments import (
    generate_drum_pad,
    generate_piano_note,
    generate_synth_note,
)
from ...utils.audio import save_audio

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Export file serving ──────────────────────────────────────────────────────


@router.get("/exports/{filename}")
async def serve_export_file(filename: str) -> FileResponse:
    """Serve a file from the exports directory (traversal-safe, basename only)."""
    safe = os.path.basename(filename)
    if safe != filename:
        raise HTTPException(status_code=400, detail=ERR_INVALID_FILENAME)
    exports_dir = config.get_exports_dir()
    file_path = exports_dir / safe
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    return FileResponse(file_path, media_type="audio/wav", filename=safe)


# ─── Bounce / Mix models ─────────────────────────────────────────────────────


class BounceTrackConfig(BaseModel):
    audio_data: str | None = None  # base64-encoded WAV (omit when using MIDI)
    midi_notes: list[int] = []
    instrument: str = "piano"  # piano | synth | drum
    note_duration: float = 1.0
    volume: float = 1.0
    pan: float = 0.0
    muted: bool = False
    solo: bool = False
    plugin_chain: list[dict] = []
    volume_automation: list[dict] = []  # [{time, value}]
    pan_automation: list[dict] = []
    crossfade_target: int | None = None  # index into request.tracks
    crossfade_ms: float = 0.0
    channels: int = 2


class BounceRequest(BaseModel):
    tracks: list[BounceTrackConfig]
    sample_rate: int = 44100
    master_volume: float = 1.0


# ─── Bounce / Mix helpers ────────────────────────────────────────────────────


def _decode_wav_data(base64_data: str) -> tuple[np.ndarray | None, int]:
    """Decode base64-encoded WAV data."""
    try:
        import base64
        import io

        import soundfile as sf

        raw_bytes = base64.b64decode(base64_data)
        buf = io.BytesIO(raw_bytes)
        audio, sample_rate = sf.read(buf, dtype="float32", always_2d=False)
        if audio.ndim > 1 and audio.shape[1] > 2:
            audio = audio[:, :2]
        return audio, sample_rate
    except Exception as e:
        logger.warning("Failed to decode WAV data: %s", e)
        return None, 44100


def _apply_pan(audio: np.ndarray, pan: float) -> np.ndarray:
    """Apply equal-power stereo pan. audio is [n] or [n, 2]; pan in [-1, 1]."""
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    pan = max(-1.0, min(1.0, pan))
    if pan <= -1.0:
        left_gain, right_gain = 1.0, 0.0
    elif pan >= 1.0:
        left_gain, right_gain = 0.0, 1.0
    else:
        angle = (pan + 1.0) * math.pi / 4.0
        left_gain = math.cos(angle)
        right_gain = math.sin(angle)
    out = np.zeros_like(audio)
    out[:, 0] = audio[:, 0] * left_gain
    out[:, 1] = audio[:, 1] * right_gain
    return out


def _build_effect_configs(plugin_chain: list[dict]) -> list[EffectConfig]:
    effect_configs = []
    for item in plugin_chain:
        plugin_id = item.get("plugin_id") or item.get("pluginId") or ""
        params = item.get("params", {}) or {}
        enabled = item.get("enabled", True)
        if enabled:
            effect_type = plugin_id.removeprefix("builtin-")
            effect_configs.append(EffectConfig(effect_type=effect_type, enabled=True, params=params))
    return effect_configs


def _render_midi_track(notes, instrument, note_duration, sr):
    """Render MIDI note numbers to a mono buffer (simultaneous chord)."""
    if not notes:
        return None
    n = max(1, int(sr * note_duration))
    out = np.zeros(n, dtype=np.float32)
    for note in notes:
        if instrument == "synth":
            out += generate_synth_note(note, note_duration, "sawtooth", sample_rate=sr)
        elif instrument == "drum":
            out += generate_drum_pad("kick", note_duration, sample_rate=sr)
        else:
            out += generate_piano_note(note, note_duration, sample_rate=sr)
    peak = np.abs(out).max()
    if peak > 0:
        out = out / peak * 0.8
    return out


def _resample(audio, sr, target_sr):
    """Linear resample to target_sr (mono or multi-channel)."""
    n = audio.shape[0]
    new_n = max(1, int(n * target_sr / sr))
    idx = np.linspace(0, n - 1, new_n)
    if audio.ndim == 1:
        return np.interp(idx, np.arange(n), audio).astype(np.float32)
    return np.stack(
        [np.interp(idx, np.arange(n), audio[:, c]) for c in range(audio.shape[1])],
        axis=1,
    ).astype(np.float32)


def _upmix(audio, ch):
    """Upmix to `ch` channels, duplicating the last channel to fill."""
    if audio.shape[1] >= ch:
        return audio
    out = np.zeros((audio.shape[0], ch), dtype=audio.dtype)
    out[:, : audio.shape[1]] = audio
    for c in range(audio.shape[1], ch):
        out[:, c] = audio[:, -1]
    return out


def _envelope_from_automation(points, n, sr, default):
    """Per-sample interpolation of automation points into an envelope."""
    if not points:
        return default
    times = np.array([p["time"] for p in points], dtype=np.float32)
    vals = np.array([p["value"] for p in points], dtype=np.float32)
    t = np.arange(n) / sr
    return np.interp(t, times, vals, left=default, right=default)


def _apply_pan_envelope(audio, pan_array):
    """Apply per-sample equal-power pan to a [n] or [n, 2] buffer."""
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    pans = np.clip(pan_array, -1.0, 1.0)
    angles = (pans + 1.0) * math.pi / 4.0
    out = np.zeros_like(audio)
    out[:, 0] = audio[:, 0] * np.cos(angles)
    out[:, 1] = audio[:, 1] * np.sin(angles)
    return out


def _apply_crossfade_out(audio, ms, sr):
    """Equal-power fade-out over the last `ms` of the buffer."""
    if ms <= 0 or audio.shape[0] == 0:
        return audio
    k = min(max(1, int(ms / 1000.0 * sr)), audio.shape[0])
    env = np.sqrt(np.linspace(1.0, 0.0, k))
    audio[-k:] = audio[-k:] * env.reshape(-1, *([1] * (audio.ndim - 1)))
    return audio


def _apply_crossfade_in(audio, ms, sr):
    """Equal-power fade-in over the first `ms` of the buffer."""
    if ms <= 0 or audio.shape[0] == 0:
        return audio
    k = min(max(1, int(ms / 1000.0 * sr)), audio.shape[0])
    env = np.sqrt(np.linspace(0.0, 1.0, k))
    audio[:k] = audio[:k] * env.reshape(-1, *([1] * (audio.ndim - 1)))
    return audio


def _apply_effects_multichannel(audio, sr, configs):
    """Apply the effect chain to each channel independently."""
    out = np.zeros_like(audio)
    for c in range(audio.shape[1]):
        out[:, c] = apply_effects_chain(audio[:, c], sr, configs)
    return out


def _bounce_mix(request: BounceRequest) -> tuple[np.ndarray, int]:
    """Mix tracks: MIDI render, effects, automation, pan, crossfade, multichannel."""
    has_solo = any(t.solo for t in request.tracks)
    target_sr = request.sample_rate
    max_ch = 2
    processed: list[tuple[np.ndarray, int, int]] = []

    for idx, tc in enumerate(request.tracks):
        if (has_solo and not tc.solo) or tc.muted:
            continue
        audio, sr = (None, target_sr)
        if tc.audio_data:
            audio, sr = _decode_wav_data(tc.audio_data)
        if audio is None or audio.shape[0] == 0:
            audio = _render_midi_track(tc.midi_notes, tc.instrument, tc.note_duration, target_sr)
            sr = target_sr
        if audio is None or audio.shape[0] == 0:
            continue
        if sr != target_sr:
            audio = _resample(audio, sr, target_sr)

        ch = tc.channels if tc.channels > 0 else (audio.shape[1] if audio.ndim > 1 else 1)
        audio = audio.reshape(-1, 1) if audio.ndim == 1 else audio
        if audio.shape[1] != ch:
            audio = _upmix(audio, ch) if audio.shape[1] < ch else audio[:, :ch]
        max_ch = max(max_ch, ch)

        effect_configs = _build_effect_configs(tc.plugin_chain)
        if effect_configs:
            audio = _apply_effects_multichannel(audio, target_sr, effect_configs)

        vol = _envelope_from_automation(tc.volume_automation, audio.shape[0], target_sr, tc.volume)
        if isinstance(vol, np.ndarray):
            audio = audio * vol.reshape(-1, *([1] * (audio.ndim - 1)))
        else:
            audio = audio * vol

        if tc.pan_automation:
            pans = _envelope_from_automation(tc.pan_automation, audio.shape[0], target_sr, tc.pan)
            if ch <= 2:
                audio = _apply_pan_envelope(audio, pans)
        elif ch <= 2:
            audio = _apply_pan(audio, tc.pan)

        if tc.crossfade_ms > 0 and tc.crossfade_target is not None:
            audio = _apply_crossfade_out(audio, tc.crossfade_ms, target_sr)
        processed.append((audio, ch, idx))

    if not processed:
        raise HTTPException(status_code=400, detail=ERR_NO_AUDIO_DATA)

    xfade_in_ms: dict[int, float] = {}
    for tc in request.tracks:
        if tc.crossfade_target is not None and tc.crossfade_ms > 0:
            xfade_in_ms[tc.crossfade_target] = tc.crossfade_ms
    max_len = max(a.shape[0] for a, _, _ in processed)
    mixed = np.zeros((max_len, max_ch), dtype=np.float32)
    for audio, _ch, idx in processed:
        if idx in xfade_in_ms:
            audio = _apply_crossfade_in(audio, xfade_in_ms[idx], target_sr)
        if audio.shape[0] < max_len:
            audio = np.pad(audio, ((0, max_len - audio.shape[0]), (0, 0)))
        if audio.shape[1] < max_ch:
            audio = _upmix(audio, max_ch)
        elif audio.shape[1] > max_ch:
            audio = audio[:, :max_ch]
        mixed += audio

    mixed *= request.master_volume
    mixed = np.clip(mixed, -1.0, 1.0)
    return mixed, target_sr


# ─── Bounce / Mix endpoints ──────────────────────────────────────────────────


@router.post("/audio/bounce")
async def bounce_mix(request: BounceRequest):
    """Mix multiple audio tracks into a single WAV and stream it back."""
    mixed, target_sr = await asyncio.to_thread(_bounce_mix, request)
    output_filename = f"plugin_bounced_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await asyncio.to_thread(save_audio, mixed, output_path, target_sr)
    buf = io.BytesIO()
    sf.write(buf, mixed, target_sr, format="WAV")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": f"inline; filename={output_filename}"},
    )


@router.post("/audio/bounce-preview")
async def bounce_mix_preview(request: BounceRequest):
    """Mix multiple audio tracks with plugin processing and return WAV bytes (no file saved)."""
    mixed, target_sr = await asyncio.to_thread(_bounce_mix, request)
    buf = io.BytesIO()
    sf.write(buf, mixed, target_sr, format="WAV")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=preview_mix.wav"},
    )
