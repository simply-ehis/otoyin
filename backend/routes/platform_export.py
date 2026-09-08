"""Platform-specific export presets."""

import io

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.audio_conversion import SUPPORTED_FORMATS, convert_audio_file, ffmpeg_available

router = APIRouter()


class ExportPreset(BaseModel):
    name: str
    description: str = ""
    format: str = "wav"
    sample_rate: int = 44100
    bit_depth: int = 16
    channels: str = "stereo"
    target_lufs: float = -16.0
    true_peak_limit_db: float = -1.0


class ApplyPresetRequest(BaseModel):
    preset_name: str
    audio_path: str
    cleanup: bool = False  # optional DeepFilterNet neural cleanup before export


EXPORT_PRESETS = {
    "podcast": ExportPreset(
        name="Podcast",
        description="MP3, platform-correct LUFS target (-16 LUFS)",
        format="mp3",
        sample_rate=44100,
        bit_depth=16,
        channels="stereo",
        target_lufs=-16.0,
        true_peak_limit_db=-1.0,
    ),
    "audiobook": ExportPreset(
        name="Audiobook Chapter",
        description="MP3, mono, -18 LUFS (matches audiobook recipe target)",
        format="mp3",
        sample_rate=44100,
        bit_depth=16,
        channels="mono",
        target_lufs=-18.0,
        true_peak_limit_db=-2.0,
    ),
    "movie_audio": ExportPreset(
        name="otoyin Movie Audio",
        description="WAV, -24 LUFS dialogue (matches film-dialogue-adr recipe target)",
        format="wav",
        sample_rate=48000,
        bit_depth=24,
        channels="stereo",
        target_lufs=-24.0,
        true_peak_limit_db=-1.0,
    ),
    "voiceover": ExportPreset(
        name="Voiceover",
        description="WAV, -12 LUFS, high quality (matches voiceover-ad recipe target)",
        format="wav",
        sample_rate=48000,
        bit_depth=24,
        channels="stereo",
        target_lufs=-12.0,
        true_peak_limit_db=-1.0,
    ),
    "social_media": ExportPreset(
        name="Social Media",
        description="MP3, loudness-optimized for platforms",
        format="mp3",
        sample_rate=44100,
        bit_depth=16,
        channels="stereo",
        target_lufs=-14.0,
        true_peak_limit_db=-1.0,
    ),
    "streaming_opus": ExportPreset(
        name="Streaming (OPUS)",
        description="OPUS, 48kHz stereo, -16 LUFS — optimal for web streaming",
        format="opus",
        sample_rate=48000,
        bit_depth=16,
        channels="stereo",
        target_lufs=-16.0,
        true_peak_limit_db=-1.0,
    ),
    "archive_aiff": ExportPreset(
        name="Archive (AIFF)",
        description="AIFF, 48kHz stereo, 24-bit — lossless archive format",
        format="aiff",
        sample_rate=48000,
        bit_depth=24,
        channels="stereo",
        target_lufs=-16.0,
        true_peak_limit_db=-1.0,
    ),
}


def _match_channels(audio: np.ndarray, target: str) -> np.ndarray:
    """Convert audio to target channel layout."""
    if audio.ndim > 1 and target == "mono":
        return audio.mean(axis=1)
    if audio.ndim == 1 and target == "stereo":
        return np.stack([audio, audio], axis=1)
    return audio


@router.get("/export/presets")
async def list_export_presets():
    """List all available platform export presets."""
    return EXPORT_PRESETS


@router.post("/export/apply-preset")
async def apply_export_preset(req: ApplyPresetRequest):
    """Apply an export preset to an audio file — normalizes to target LUFS and formats."""
    import asyncio

    from .. import config
    from ..services.loudness import normalize_to_lufs
    from ..utils.async_audio import async_load_audio, async_reduce_noise_deepfilter

    preset = EXPORT_PRESETS.get(req.preset_name)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Export preset '{req.preset_name}' not found")

    resolved_path = config.resolve_storage_path(req.audio_path)
    if resolved_path is None or not resolved_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    audio, sample_rate = await async_load_audio(str(resolved_path))
    audio = _match_channels(audio, preset.channels)
    if req.cleanup:
        audio = await async_reduce_noise_deepfilter(audio, sample_rate)
    normalized = normalize_to_lufs(audio, sample_rate, preset.target_lufs)

    fmt = preset.format.lower()
    native_formats = {"wav", "flac", "ogg"}

    if fmt in native_formats:
        import tempfile
        from pathlib import Path

        import soundfile as sf

        suffix = f".{fmt}"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp_path = tmp.name
        from ..utils.audio import save_audio

        await asyncio.to_thread(save_audio, normalized, tmp_path, sample_rate)

        buf = io.BytesIO()
        sf.write(buf, normalized, sample_rate, format=fmt.upper())
        buf.seek(0)
        Path(tmp_path).unlink(missing_ok=True)

        media_type = f"audio/{fmt}"
        return StreamingResponse(
            buf,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="export_{req.preset_name}.{fmt}"'},
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

        sf.write(tmp_wav.name, normalized, sample_rate)
        tmp_wav_path = tmp_wav.name

    try:
        output_path = convert_audio_file(
            tmp_wav_path,
            fmt,
            bitrate="128k",
            sample_rate=sample_rate,
        )
        with open(output_path, "rb") as f:
            content = f.read()
        media_type = SUPPORTED_FORMATS[fmt]["mime"]
        return StreamingResponse(
            io.BytesIO(content),
            media_type=media_type,
            headers={
                "Content-Disposition": f'inline; filename="export_{req.preset_name}.{SUPPORTED_FORMATS[fmt]["ext"]}"'
            },
        )
    finally:
        Path(tmp_wav_path).unlink(missing_ok=True)
        if "output_path" in locals():
            Path(output_path).unlink(missing_ok=True)
