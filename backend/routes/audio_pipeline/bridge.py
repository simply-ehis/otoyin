"""General Audio Bridge — import/export beyond Leone-only."""

import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...errors import ERR_AUDIO_NOT_FOUND

router = APIRouter()


class ImportAudioRequest(BaseModel):
    audio_path: str


class ExportAudioRequest(BaseModel):
    audio_path: str
    format: str = "wav"
    sample_rate: int | None = None
    bit_depth: int = 16
    normalize: bool = True
    target_lufs: float = -16.0


@router.post("/bridge/import")
async def import_audio_to_library(data: ImportAudioRequest):
    """Import any audio asset from Library or Motion timeline into 21labs."""
    from ... import config
    from ...utils.async_audio import async_load_audio

    resolved = config.resolve_storage_path(data.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sr = await async_load_audio(str(resolved))
    return {
        "status": "imported",
        "sample_rate": sr,
        "duration_seconds": len(audio) / sr,
        "channels": 1 if audio.ndim == 1 else audio.shape[1],
    }


@router.post("/bridge/export")
async def export_audio_from_library(data: ExportAudioRequest):
    """Export edited result as standalone file — WAV / MP3 / FLAC / OGG."""

    from ... import config
    from ...services.loudness import normalize_to_lufs
    from ...utils.async_audio import async_load_audio

    resolved = config.resolve_storage_path(data.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sr = await async_load_audio(str(resolved))
    if data.sample_rate and data.sample_rate != sr:
        import numpy as np

        new_len = int(len(audio) * data.sample_rate / sr)
        audio = np.interp(np.linspace(0, len(audio) - 1, new_len), np.arange(len(audio)), audio)
        sr = data.sample_rate

    if data.normalize:
        audio = normalize_to_lufs(audio, sr, data.target_lufs)

    import soundfile as sf

    subtype = None
    if data.format.lower() in ("wav", "flac"):
        depth_map = {"16": "PCM_16", "24": "PCM_24", "32": "PCM_32"}
        subtype = depth_map.get(str(data.bit_depth))
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format=data.format.upper(), subtype=subtype)
    buf.seek(0)

    media_type = f"audio/{data.format}"
    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="export.{data.format}"'},
    )
