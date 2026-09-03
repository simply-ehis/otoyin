"""Multi-take comping: assemble selected regions into one composite audio clip."""

import base64
import io
import logging

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from ..errors import ERR_NO_COMP_SEGMENTS

logger = logging.getLogger(__name__)

router = APIRouter()


class CompSegment(BaseModel):
    start_ms: float = 0.0
    end_ms: float
    audio_base64: str | None = None
    tone_hz: float | None = None
    sample_rate: int | None = None


class CompRequest(BaseModel):
    segments: list[CompSegment]
    sample_rate: int = 22050
    crossfade_ms: float = 0.0


def _segment_audio(seg: CompSegment, sr: int) -> np.ndarray:
    """Return the audio for one region: a slice of provided take audio, or a
    synthesized preview tone when no take audio is supplied."""
    duration = max(0.0, seg.end_ms - seg.start_ms)
    n = int(duration / 1000.0 * sr)
    if seg.audio_base64:
        raw = base64.b64decode(seg.audio_base64)
        data, file_sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
        if data.ndim > 1:
            data = data.mean(axis=1)
        start_s = int(seg.start_ms / 1000.0 * file_sr)
        end_s = int(seg.end_ms / 1000.0 * file_sr)
        chunk = data[start_s:end_s]
        if file_sr != sr and len(chunk) > 1:
            indices = np.linspace(0, len(chunk) - 1, round(len(chunk) * sr / file_sr))
            chunk = np.interp(indices, np.arange(len(chunk)), chunk)
        return chunk.astype(np.float32)
    hz = seg.tone_hz or 440.0
    t = np.arange(max(n, 1)) / sr
    return (np.sin(2 * np.pi * hz * t) * 0.6).astype(np.float32)


def _crossfade(parts: list[np.ndarray], sr: int, crossfade_ms: float) -> np.ndarray:
    if not parts:
        return np.zeros(1, dtype=np.float32)
    if crossfade_ms <= 0:
        return np.concatenate(parts)
    fade = max(1, int(crossfade_ms / 1000.0 * sr))
    out = parts[0]
    for part in parts[1:]:
        if len(out) < fade or len(part) < fade:
            out = np.concatenate([out, part])
            continue
        mixed = out[-fade:] + part[:fade]
        out = np.concatenate([out[:-fade], mixed, part[fade:]])
    return out


@router.post("/comping/assemble")
async def assemble_comp(req: CompRequest) -> Response:
    """Concatenate the selected comp regions into a single playable clip.

    Each segment may carry base64 WAV take audio (sliced by start/end ms) or,
    for preview, a synthesized tone. Segments are assembled in order with an
    optional crossfade between them.
    """
    sr = req.sample_rate
    parts = [_segment_audio(seg, sr) for seg in req.segments]
    parts = [p for p in parts if p is not None and len(p) > 0]
    if not parts:
        raise HTTPException(status_code=400, detail=ERR_NO_COMP_SEGMENTS)
    composite = _crossfade(parts, sr, req.crossfade_ms)
    composite = np.clip(composite, -1.0, 1.0)
    buf = io.BytesIO()
    sf.write(buf, composite, sr, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")
