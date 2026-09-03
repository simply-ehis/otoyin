"""Advanced Scene & Spatial Modeling endpoints."""

import io

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..services.steam_audio import steam_audio

router = APIRouter()


class SpatialPosition(BaseModel):
    audio_path: str = ""
    x: float = Field(default=0.0, ge=-1.0, le=1.0)
    y: float = Field(default=0.0, ge=-1.0, le=1.0)
    z: float = Field(default=0.0, ge=-1.0, le=1.0)
    distance: float = Field(default=1.0, ge=0.1, le=10.0)
    gain_db: float = Field(default=0.0, ge=-30.0, le=12.0)


class ConvolutionPreset(BaseModel):
    name: str
    description: str
    room_size: float = Field(default=0.5, ge=0.0, le=1.0)
    decay_time_ms: float = Field(default=500.0, ge=10.0, le=5000.0)
    pre_delay_ms: float = Field(default=20.0, ge=0.0, le=100.0)
    wet_dry_mix: float = Field(default=0.3, ge=0.0, le=1.0)
    damping: float = Field(default=0.5, ge=0.0, le=1.0)


SPATIALIZER_PRESETS = {
    "headphone_binaural": {
        "name": "Headphone Binaural",
        "description": "HRTF-like panning for headphones",
    },
    "stereo_front": {
        "name": "Stereo Front",
        "description": "Standard stereo placement",
    },
}

CONVOLUTION_PRESETS = {
    "car_interior": ConvolutionPreset(
        name="Car Interior",
        description="Inside a moving car",
        room_size=0.2,
        decay_time_ms=150,
        pre_delay_ms=5,
        wet_dry_mix=0.15,
        damping=0.8,
    ),
    "coffee_shop": ConvolutionPreset(
        name="Coffee Shop",
        description="Crowded coffee shop",
        room_size=0.6,
        decay_time_ms=400,
        pre_delay_ms=15,
        wet_dry_mix=0.3,
        damping=0.6,
    ),
    "bedroom": ConvolutionPreset(
        name="Small Bedroom",
        description="Dry, small drywall room",
        room_size=0.15,
        decay_time_ms=200,
        pre_delay_ms=3,
        wet_dry_mix=0.1,
        damping=0.9,
    ),
    "church": ConvolutionPreset(
        name="High-Ceiling Church",
        description="Large reverberant space",
        room_size=0.95,
        decay_time_ms=2500,
        pre_delay_ms=40,
        wet_dry_mix=0.5,
        damping=0.3,
    ),
    "studio_booth": ConvolutionPreset(
        name="Studio Booth",
        description="Treated recording booth",
        room_size=0.1,
        decay_time_ms=80,
        pre_delay_ms=1,
        wet_dry_mix=0.05,
        damping=0.95,
    ),
}


def _wav_response(audio: np.ndarray, sr: int) -> StreamingResponse:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/wav")


def _load_audio(audio_path: str):
    from .. import config
    from ..utils.audio import load_audio

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        return None, None, None
    audio, sr = load_audio(str(resolved))
    return audio, sr, resolved


@router.get("/spatial/presets")
async def list_spatial_presets():
    return SPATIALIZER_PRESETS


@router.get("/spatial/convolution-presets")
async def list_convolution_presets():
    return {k: v.model_dump() for k, v in CONVOLUTION_PRESETS.items()}


@router.get("/spatial/status")
async def spatial_status():
    """Check if Steam Audio SDK is available and enable it if present."""
    sdk_ready = steam_audio.enable_sdk()
    return {
        "steam_audio": steam_audio.available,
        "sdk_enabled": steam_audio.sdk_enabled,
        "hrtf_available": steam_audio.hrtf_available,
        "backend": "steam_audio" if sdk_ready else "numpy_dsp",
    }


@router.post("/spatial/apply-binaural")
async def apply_binaural_panning(position: SpatialPosition):
    steam_audio.enable_sdk()
    audio, sr, _ = _load_audio(position.audio_path)
    if audio is None:
        raise HTTPException(status_code=404, detail="Audio file not found")
    result = steam_audio.apply_binaural(
        audio,
        sr,
        position.x,
        position.y,
        position.z,
        position.gain_db,
        position.distance,
    )
    return _wav_response(result, sr)


@router.post("/spatial/apply-convolution")
async def apply_convolution(
    audio_path: str = Query(...),
    environment: str = "studio_booth",
    wet_dry_mix: float = Query(default=0.3, ge=0.0, le=1.0),
):
    """Apply environmental convolution reverb to audio."""
    steam_audio.enable_sdk()
    audio, sr, _ = _load_audio(audio_path)
    if audio is None:
        raise HTTPException(status_code=404, detail="Audio file not found")
    preset = CONVOLUTION_PRESETS.get(environment)
    if preset is None:
        raise HTTPException(status_code=400, detail=f"Unknown environment: {environment}")
    result = steam_audio.apply_convolution(
        audio,
        sr,
        preset.room_size,
        preset.decay_time_ms,
        preset.pre_delay_ms,
        wet_dry_mix,
        preset.damping,
    )
    return _wav_response(result, sr)


@router.post("/spatial/apply-doppler")
async def apply_doppler_effect(speed: float = 1.0, audio_path: str = ""):
    if not audio_path:
        raise HTTPException(status_code=400, detail="audio_path required")
    steam_audio.enable_sdk()
    audio, sr, _ = _load_audio(audio_path)
    if audio is None:
        raise HTTPException(status_code=404, detail="Audio file not found")
    result = steam_audio.apply_doppler(audio, sr, speed)
    return _wav_response(result, sr)


@router.post("/spatial/render")
async def render_full(
    position: SpatialPosition,
    environment: str = "studio_booth",
    wet_dry_mix: float = Query(default=0.3, ge=0.0, le=1.0),
    speed: float = Query(default=0.0, ge=0.0, le=2.0),
):
    """Full spatial render: doppler (optional) + binaural + convolution in one pass."""
    steam_audio.enable_sdk()
    audio, sr, _ = _load_audio(position.audio_path)
    if audio is None:
        raise HTTPException(status_code=404, detail="Audio file not found")
    mono = audio.mean(axis=1) if audio.ndim > 1 else audio
    if speed and speed > 0:
        mono = steam_audio.apply_doppler(mono, sr, speed)
    binaural = steam_audio.apply_binaural(
        mono,
        sr,
        position.x,
        position.y,
        position.z,
        position.gain_db,
        position.distance,
    )
    preset = CONVOLUTION_PRESETS.get(environment)
    if preset:
        left = steam_audio.apply_convolution(
            binaural[:, 0],
            sr,
            preset.room_size,
            preset.decay_time_ms,
            preset.pre_delay_ms,
            wet_dry_mix,
            preset.damping,
        )
        right = steam_audio.apply_convolution(
            binaural[:, 1],
            sr,
            preset.room_size,
            preset.decay_time_ms,
            preset.pre_delay_ms,
            wet_dry_mix,
            preset.damping,
        )
        binaural = np.stack([left, right], axis=1)
    return _wav_response(binaural, sr)
