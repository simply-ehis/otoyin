"""General Audio Bridge — import/export beyond Leone-only."""

import io
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ...errors import ERR_AUDIO_NOT_FOUND
from ...services.audio_conversion import SUPPORTED_FORMATS, convert_audio_file, ffmpeg_available

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
    """Export edited result as standalone file — WAV / MP3 / FLAC / OGG / OPUS / AIFF / M4A."""

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

    fmt = data.format.lower()
    # Use soundfile for native formats, ffmpeg for others
    native_formats = {"wav", "flac", "ogg"}

    if fmt in native_formats:
        import soundfile as sf

        subtype = None
        if fmt in ("wav", "flac"):
            depth_map = {"16": "PCM_16", "24": "PCM_24", "32": "PCM_32"}
            subtype = depth_map.get(str(data.bit_depth))
        buf = io.BytesIO()
        sf.write(buf, audio, sr, format=fmt.upper(), subtype=subtype)
        buf.seek(0)
        media_type = f"audio/{fmt}"
        return StreamingResponse(
            buf,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="export.{fmt}"'},
        )

    # Use ffmpeg-based conversion for MP3, OPUS, AIFF, M4A, etc.
    if not ffmpeg_available():
        raise HTTPException(status_code=501, detail="ffmpeg not available for this format")

    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {fmt}. Supported: {', '.join(SUPPORTED_FORMATS)}",
        )

    # Write to temp WAV first, then convert
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        import soundfile as sf

        sf.write(tmp_wav.name, audio, sr)
        tmp_wav_path = tmp_wav.name

    try:
        output_path = convert_audio_file(
            tmp_wav_path,
            fmt,
            bitrate="128k",
            sample_rate=sr if data.sample_rate else None,
        )
        with open(output_path, "rb") as f:
            content = f.read()
        media_type = SUPPORTED_FORMATS[fmt]["mime"]
        return StreamingResponse(
            io.BytesIO(content),
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="export.{SUPPORTED_FORMATS[fmt]["ext"]}"'},
        )
    finally:
        Path(tmp_wav_path).unlink(missing_ok=True)
        if "output_path" in locals():
            Path(output_path).unlink(missing_ok=True)


class BatchConvertRequest(BaseModel):
    files: list[str]  # list of storage paths
    format: str
    sample_rate: int | None = None
    bit_depth: int = 16
    normalize: bool = True
    target_lufs: float = -16.0
    zip_output: bool = True


@router.post("/bridge/batch-convert")
async def batch_convert_audio(data: BatchConvertRequest):
    """Batch convert multiple audio files to a target format.

    Returns a ZIP archive containing all converted files, or streams them individually.
    """
    if not ffmpeg_available():
        raise HTTPException(status_code=501, detail="ffmpeg not available")

    fmt = data.format.lower()
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {fmt}. Supported: {', '.join(SUPPORTED_FORMATS)}",
        )

    from ... import config

    results = []
    for audio_path in data.files:
        resolved = config.resolve_storage_path(audio_path)
        if resolved is None or not resolved.exists():
            results.append({"input": audio_path, "error": "File not found"})
            continue

        try:
            tmp_wav_path = None
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
                tmp_wav_path = tmp_wav.name

                import soundfile as sf

                from ...utils.async_audio import async_load_audio

                audio, sr = await async_load_audio(str(resolved))
                if data.sample_rate and data.sample_rate != sr:
                    import numpy as np

                    new_len = int(len(audio) * data.sample_rate / sr)
                    audio = np.interp(np.linspace(0, len(audio) - 1, new_len), np.arange(len(audio)), audio)
                    sr = data.sample_rate

                if data.normalize:
                    from ...services.loudness import normalize_to_lufs

                    audio = normalize_to_lufs(audio, sr, data.target_lufs)

                sf.write(tmp_wav.name, audio, sr)

            output_path = convert_audio_file(
                tmp_wav_path,
                fmt,
                bitrate="128k",
                sample_rate=sr if data.sample_rate else None,
            )
            results.append(
                {
                    "input": audio_path,
                    "output_path": str(output_path),
                    "storage_path": config.to_storage_path(output_path),
                }
            )
        except Exception as e:
            results.append({"input": audio_path, "error": str(e)})
        finally:
            if tmp_wav_path:
                Path(tmp_wav_path).unlink(missing_ok=True)

    if data.zip_output:
        # Create ZIP archive
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for r in results:
                if "output_path" in r:
                    zf.write(r["output_path"], Path(r["output_path"]).name)
                    Path(r["output_path"]).unlink(missing_ok=True)
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="batch_convert_{fmt}.zip"'},
        )

    return {"results": results}
