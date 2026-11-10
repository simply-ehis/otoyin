"""Advanced Scene & Spatial Modeling endpoints."""

import io

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from scipy.signal import fftconvolve

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


def _ir_length(sample_rate: int, decay_ms: float) -> int:
    return max(1, int(sample_rate * decay_ms / 1000))


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


class SpatialSource(BaseModel):
    """One positioned source in a spatial mix."""

    audio_path: str = ""
    x: float = Field(default=0.0, ge=-1.0, le=1.0)
    y: float = Field(default=0.0, ge=-1.0, le=1.0)
    z: float = Field(default=0.0, ge=-1.0, le=1.0)
    distance: float = Field(default=1.0, ge=0.1, le=10.0)
    gain_db: float = Field(default=0.0, ge=-30.0, le=12.0)


class SpatialMix(BaseModel):
    """A full spatial render request: many positioned sources, one mix."""

    sources: list[SpatialSource] = Field(default_factory=list)
    environment: str = "studio_booth"
    wet_dry_mix: float = Field(default=0.3, ge=0.0, le=1.0)
    speed: float = Field(default=0.0, ge=0.0, le=2.0)
    binaural: bool = True


MAX_SOURCES = 8


def _convolve_stereo(
    audio: np.ndarray,
    sr: int,
    preset: ConvolutionPreset,
    wet_dry: float,
) -> np.ndarray:
    """Apply the environment convolution preset to each channel of stereo audio."""
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    n = _ir_length(sr, preset.decay_time_ms)
    ir = np.zeros(n, dtype=np.float32)
    pd = int(preset.pre_delay_ms * sr / 1000)
    if pd < n:
        ir[pd] = 1.0
    ds = int(preset.decay_time_ms * sr / 1000)
    end = min(pd + ds, n)
    t = np.arange(pd + 1, end) - pd
    ir[pd + 1 : end] = np.exp(-t / max(ds, 1) * (1 - preset.damping) * 5) * 0.01
    ir /= np.max(np.abs(ir)) + 1e-8
    out = np.empty_like(audio)
    for c in range(audio.shape[1]):
        wet = fftconvolve(audio[:, c], ir, mode="full")[: len(audio)]
        out[:, c] = audio[:, c] * (1 - wet_dry) + wet * wet_dry
    return out.astype(np.float32)


@router.post("/spatial/render-mix")
async def render_spatial_mix(mix: SpatialMix):
    """Render multiple positioned sources into one spatialized WAV mix.

    Each source is (optionally) doppler-shifted, binaural-panned to its
    (x, y, z) position with its own gain/distance, convolved with the chosen
    environment, then all sources are summed and peak-normalized so the mix
    never clips.
    """
    steam_audio.enable_sdk()
    sources = mix.sources
    if not sources:
        raise HTTPException(status_code=400, detail="At least one source is required")
    if len(sources) > MAX_SOURCES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_SOURCES} sources per mix")
    preset = CONVOLUTION_PRESETS.get(mix.environment)
    if preset is None:
        raise HTTPException(status_code=400, detail=f"Unknown environment: {mix.environment}")

    max_len = 0
    rendered: list[np.ndarray] = []
    sample_rates: list[int] = []
    for src in sources:
        audio, sr, _ = _load_audio(src.audio_path)
        if audio is None:
            raise HTTPException(status_code=404, detail=f"Audio file not found: {src.audio_path}")
        mono = audio.mean(axis=1) if audio.ndim > 1 else audio
        if mix.speed and mix.speed > 0:
            mono = steam_audio.apply_doppler(mono, sr, mix.speed)
        if mix.binaural:
            stereo = steam_audio.apply_binaural(mono, sr, src.x, src.y, src.z, src.gain_db, src.distance)
        else:
            g = 10.0 ** (src.gain_db / 20.0) / max(src.distance, 0.1)
            stereo = np.stack([mono * g, mono * g], axis=1).astype(np.float32)
        stereo = _convolve_stereo(stereo, sr, preset, mix.wet_dry_mix)
        rendered.append(stereo)
        sample_rates.append(sr)
        max_len = max(max_len, len(stereo))

    sr = sample_rates[0]
    mix_buf = np.zeros((max_len, 2), dtype=np.float32)
    for stereo in rendered:
        if len(stereo) < max_len:
            padded = np.zeros((max_len, 2), dtype=np.float32)
            padded[: len(stereo)] = stereo
            stereo = padded
        mix_buf += stereo

    peak = float(np.max(np.abs(mix_buf))) if max_len else 0.0
    if peak > 0.95:
        mix_buf = mix_buf * (0.95 / peak)
    return _wav_response(mix_buf, sr)
