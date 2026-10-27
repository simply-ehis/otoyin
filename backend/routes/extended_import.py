"""Extended import endpoints."""

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()

# Media directories that are allowed for file serving
_media_dirs: list[Path] | None = None


def _get_allowed_dirs() -> list[Path]:
    global _media_dirs
    if _media_dirs is None:
        from ..config import get_data_dir

        _media_dirs = [get_data_dir().resolve()]
    return _media_dirs


def _validate_path(path: Path) -> Path:
    """Validate that a path is within allowed directories."""
    resolved = path.resolve()
    for allowed in _get_allowed_dirs():
        if resolved.is_relative_to(allowed):
            return resolved
    raise HTTPException(status_code=403, detail="Access denied: path outside allowed directory")


_VIDEO_MIME = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".m4v": "video/mp4",
}


@router.get("/import/video-preview")
async def preview_video_endpoint(file_path: str = Query(...)):
    """Stream a local video file for in-app preview."""
    path = _validate_path(Path(file_path))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Video file not found")
    mime = _VIDEO_MIME.get(path.suffix.lower())
    if not mime:
        raise HTTPException(status_code=400, detail="Unsupported video format")
    return FileResponse(path, media_type=mime)


_AUDIO_MIME = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
}


@router.get("/import/audio-preview")
async def preview_audio_endpoint(file_path: str = Query(...)):
    """Stream a local audio file for preview."""
    path = _validate_path(Path(file_path))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")
    mime = _AUDIO_MIME.get(path.suffix.lower())
    if not mime:
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    return FileResponse(path, media_type=mime)


class ExtractAudioRequest(BaseModel):
    video_path: str
    sample_rate: int = 48000
    channels: int = 1


class ConvertAudioRequest(BaseModel):
    input_path: str
    target_format: str = "wav"
    sample_rate: int = 48000
    channels: int = 1
    sanitize: bool = False


@router.get("/import/formats")
async def list_import_formats():
    """List all supported import formats."""
    from ..services.extended_import import check_ffmpeg_available, get_supported_formats

    return {
        "formats": get_supported_formats(),
        "ffmpeg_available": check_ffmpeg_available(),
    }


@router.post("/import/extract-audio")
async def extract_audio_from_video_endpoint(data: ExtractAudioRequest):
    """Extract audio track from a video file."""
    from ..services.extended_import import extract_audio_from_video

    _validate_path(Path(data.video_path))
    try:
        output = extract_audio_from_video(data.video_path, sample_rate=data.sample_rate, channels=data.channels)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Audio extraction failed") from e
    return {"audio_path": output}


@router.post("/import/convert")
async def convert_audio_endpoint(data: ConvertAudioRequest):
    """Convert audio file to a different format.

    ``sanitize`` (default off, lazy-loaded) applies the DeepFilterNet neural
    cleanup only when explicitly requested, so users who don't want cleanup
    are never forced to load the model during import.
    """
    from ..services.extended_import import convert_audio

    _validate_path(Path(data.input_path))
    try:
        output = convert_audio(
            data.input_path, target_format=data.target_format, sample_rate=data.sample_rate, channels=data.channels
        )
        if data.sanitize:
            from ..services.noise_reduction import reduce_noise_deepfilternet
            from ..utils.audio import load_audio, save_audio

            audio, sr = await asyncio.to_thread(load_audio, output)
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            cleaned = await asyncio.to_thread(reduce_noise_deepfilternet, audio, int(sr))
            await asyncio.to_thread(save_audio, cleaned, output, int(sr))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Audio conversion failed") from e
    return {"audio_path": output}


@router.get("/import/info")
async def get_audio_info_endpoint(file_path: str):
    """Get metadata about an audio or video file."""
    from ..services.extended_import import get_audio_info

    return get_audio_info(file_path)


class MuxRequest(BaseModel):
    video_path: str
    audio_path: str
    output_name: str = "muxed.mp4"


@router.post("/video/mux")
async def mux_audio_video(data: MuxRequest):
    """Combine a video file with an audio file into an MP4 using ffmpeg."""
    from ..config import resolve_storage_path
    from ..services.audio_conversion import ffmpeg_path

    vpath = resolve_storage_path(data.video_path)
    apath = resolve_storage_path(data.audio_path)
    if vpath is None or not vpath.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    if apath is None or not apath.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    ff = ffmpeg_path()
    if not ff:
        raise HTTPException(status_code=503, detail="ffmpeg not available")

    import subprocess
    out_dir = vpath.parent
    out_path = out_dir / data.output_name
    cmd = [
        ff, "-y", "-i", str(vpath), "-i", str(apath),
        "-c:v", "copy", "-c:a", "aac", "-shortest", str(out_path),
    ]
    try:
        await asyncio.to_thread(subprocess.run, cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Mux failed: {e.stderr.decode(errors='ignore')[:300]}") from e

    from ..config import to_storage_path
    return {"output_path": to_storage_path(out_path), "absolute_path": str(out_path)}
