"""Lottie export — export audio compatible with Lottie animations."""

import asyncio
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()


class LottieExportRequest(BaseModel):
    audio_path: str
    name: str = "audio"
    sample_rate: int = 44100


@router.post("/export/lottie")
async def export_lottie_audio(data: LottieExportRequest):
    """Export audio in WAV format for use with Lottie animations.

    Loads the source audio, converts to the requested sample rate,
    and saves to the exports directory. Returns download metadata.
    """

    from .. import config
    from ..utils.async_audio import async_load_audio, async_save_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    audio, sample_rate = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    duration = float(len(audio)) / sample_rate

    if sample_rate != data.sample_rate:
        try:
            import librosa

            audio = await asyncio.to_thread(librosa.resample, audio, orig_sr=sample_rate, target_sr=data.sample_rate)
            sample_rate = data.sample_rate
        except ImportError:
            pass

    export_id = str(uuid.uuid4())[:8]
    safe_name = "".join(c for c in data.name if c.isalnum() or c in " _-").strip() or "audio"
    filename = f"lottie-{safe_name}-{export_id}.wav"

    exports_dir = config.get_exports_dir()
    output_path = exports_dir / filename

    await async_save_audio(audio, str(output_path), sample_rate)

    size_bytes = output_path.stat().st_size

    return {
        "filename": filename,
        "size_bytes": size_bytes,
        "duration": duration,
        "sample_rate": sample_rate,
        "download_url": f"/exports/{filename}",
    }


@router.get("/exports/{filename}")
async def get_export_file(filename: str):
    """Serve an exported audio file for download."""
    from .. import config

    exports_dir = config.get_exports_dir()
    file_path = exports_dir / filename

    resolved = file_path.resolve()
    try:
        resolved.relative_to(exports_dir.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Invalid file path") from exc

    if not resolved.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    return FileResponse(
        path=str(resolved),
        media_type="audio/wav",
        filename=filename,
    )
