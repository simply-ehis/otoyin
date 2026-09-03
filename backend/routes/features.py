"""ADR, session, batch, noise reduction, preset, and remaining endpoints."""

import io

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..errors import (
    ERR_AUDIO_NOT_FOUND,
    ERR_ENHANCEMENT_MODELS_MISSING,
    ERR_INVALID_MODE,
    ERR_INVALID_PRESET,
    ERR_INVALID_SESSION_DATA,
    ERR_VOICE_CHANGER_FAILED,
)

router = APIRouter()


class NoiseReduceRequest(BaseModel):
    audio_path: str
    vad_threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class VoiceCleanRequest(BaseModel):
    audio_path: str
    preset: str = Field(default="medium", pattern="^(light|medium|heavy)$")
    strength: float = Field(default=1.0, ge=0.0, le=1.0)
    engine: str | None = None


class VoiceCleanABRequest(BaseModel):
    audio_path: str
    engine: str | None = None
    strength: float = Field(default=1.0, ge=0.0, le=1.0)


class AudioEnhanceRequest(BaseModel):
    audio_path: str
    mode: str = "auto"


class LoudnessMeasureRequest(BaseModel):
    audio_path: str


class PresetExportRequest(BaseModel):
    name: str
    effects_chain: list[dict]
    description: str = ""
    author: str = "User"
    tags: list[str] = []


class PresetImportRequest(BaseModel):
    preset_json: str


class SessionSaveRequest(BaseModel):
    name: str
    session_data: str


@router.post("/audio/noise-reduce")
async def noise_reduce(data: NoiseReduceRequest):
    """Apply noise reduction to audio."""
    import asyncio

    from .. import config
    from ..services.noise_reduction import reduce_noise_rnnoise
    from ..utils.async_audio import async_load_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sr = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    cleaned = await asyncio.to_thread(reduce_noise_rnnoise, audio, sr, data.vad_threshold)

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, cleaned, sr, format="WAV")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="cleaned.wav"'},
    )


@router.post("/audio/voice-clean")
async def voice_clean(data: VoiceCleanRequest):
    """Apply the Phase 1 TTS enhancer chain (denoise -> de-ess -> warmth -> dynamics)."""
    import asyncio

    from .. import config
    from ..services.tts_enhancer import enhance_tts
    from ..utils.async_audio import async_load_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sr = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    cleaned = await asyncio.to_thread(
        enhance_tts,
        audio,
        sr,
        {"preset": data.preset, "strength": data.strength},
        engine=data.engine,
    )

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, cleaned, sr, format="WAV")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="voice-cleaned.wav"'},
    )


@router.post("/audio/voice-clean/ab")
async def voice_clean_ab(data: VoiceCleanABRequest):
    """Return both original and enhanced audio for A/B comparison.

    Response is a JSON object with ``original`` and ``enhanced`` keys,
    each holding a base64-encoded WAV string.  The caller (typically a
    frontend A/B toggle) can decode both and let the user flip between
    them without a second round-trip.
    """
    import base64

    import soundfile as sf

    from .. import config
    from ..services.tts_enhancer import ENGINE_PRESETS, enhance_tts
    from ..utils.async_audio import async_load_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sr = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Determine which preset the engine would use
    engine_preset = ENGINE_PRESETS.get(data.engine or "", "medium")

    # Generate enhanced version
    import asyncio

    enhanced = await asyncio.to_thread(
        enhance_tts,
        audio,
        sr,
        {"preset": engine_preset, "strength": data.strength},
        engine=data.engine,
    )

    # Encode both as base64 WAV
    def _to_b64(arr: np.ndarray) -> str:
        buf = io.BytesIO()
        sf.write(buf, arr, sr, format="WAV")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode("ascii")

    return {
        "sample_rate": sr,
        "preset": engine_preset,
        "engine": data.engine,
        "original_b64": _to_b64(audio),
        "enhanced_b64": _to_b64(enhanced),
    }


@router.post("/audio/enhance")
async def audio_enhance(data: AudioEnhanceRequest):
    """Enhance audio quality (Lavasr bandwidth extension + denoise)."""
    import io

    import soundfile as sf

    from .. import config
    from ..services.audio_enhancer import EnhanceMode, enhance_audio
    from ..utils.async_audio import async_load_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    try:
        mode = EnhanceMode(data.mode)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=ERR_INVALID_MODE,
        ) from exc

    audio, sr = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    import asyncio

    try:
        enhanced, out_sr = await asyncio.to_thread(enhance_audio, audio, sr, mode=mode)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=501,
            detail=ERR_ENHANCEMENT_MODELS_MISSING,
        ) from exc

    buf = io.BytesIO()
    sf.write(buf, enhanced, out_sr, format="WAV")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="enhanced.wav"'},
    )


@router.post("/audio/loudness")
async def measure_loudness(data: LoudnessMeasureRequest):
    """Measure loudness (LUFS) of audio using ITU-R BS.1770-4."""
    from .. import config
    from ..services.loudness import measure_loudness as bs1770_measure
    from ..utils.async_audio import async_load_audio

    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    audio, sr = await async_load_audio(str(audio_path))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    return bs1770_measure(audio, sr)


@router.post("/presets/export")
async def export_preset(data: PresetExportRequest):
    """Export a preset to JSON."""
    from ..services.presets import create_preset, preset_to_export

    preset = create_preset(
        data.name, data.effects_chain, description=data.description, author=data.author, tags=data.tags
    )
    return {"preset_json": preset_to_export(preset)}


@router.post("/presets/import")
async def import_preset(data: PresetImportRequest):
    """Import a preset from JSON."""
    from ..services.presets import preset_from_import

    try:
        preset = preset_from_import(data.preset_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=ERR_INVALID_PRESET) from e
    return {
        "name": preset.name,
        "description": preset.description,
        "effects_chain": preset.effects_chain,
        "tags": preset.tags,
    }


@router.get("/presets/builtin")
async def list_builtin_presets():
    """List built-in effect presets."""
    from ..services.presets import BUILTIN_PRESETS

    return [
        {"name": p.name, "description": p.description, "effects_chain": p.effects_chain, "tags": p.tags}
        for p in BUILTIN_PRESETS
    ]


@router.post("/session/save")
async def save_session(data: SessionSaveRequest):
    """Save a .dstf session file."""
    from ..services.session import session_from_json, validate_session

    try:
        session = session_from_json(data.session_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=ERR_INVALID_SESSION_DATA) from e
    warnings = validate_session(session)
    return {"valid": len(warnings) == 0, "warnings": warnings}


@router.post("/session/load")
async def load_session(data: SessionSaveRequest):
    """Load and validate a .dstf session."""
    from ..services.session import session_from_json, session_to_dict

    try:
        session = session_from_json(data.session_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=ERR_INVALID_SESSION_DATA) from e
    return session_to_dict(session)


# ── Voice changer control surface (status/effects/enable/preset/profile) ──

_VC_EFFECTS = ["pitch_shift", "formant_shift", "reverb", "chorus"]
_VC_PRESETS = {"off", "subtle", "radio", "robot", "deep", "bright"}


@router.get("/voice-changer/capabilities")
async def voice_changer_capabilities():
    """Get voice changer latency and capability info."""
    return {
        "target_latency_ms": 50,
        "supported_effects": _VC_EFFECTS,
        "max_chain_length": 4,
        "sample_rate": 48000,
        "frame_size_ms": 10,
    }


class VoiceChangerEnableRequest(BaseModel):
    enabled: bool


class VoiceChangerPresetRequest(BaseModel):
    preset: str = Field(pattern="^(off|subtle|radio|robot|deep|bright)$")


class VoiceChangerProfileRequest(BaseModel):
    profile_id: str | None = None


def _vc_app_setting(db, key: str):
    from ..database.models import AppSetting

    row = db.query(AppSetting).filter_by(key=key).first()
    return (row.value_json or {}).get("value") if row else None


def _vc_set_app_setting(db, key: str, value) -> None:
    from ..database.models import AppSetting

    row = db.query(AppSetting).filter_by(key=key).first()
    if row is None:
        row = AppSetting(key=key, value_json={})
        db.add(row)
    row.value_json = {"value": value}
    db.commit()


@router.get("/voice-changer/status")
async def voice_changer_status(db: Session = Depends(get_db)):
    """Live process state + persisted VC configuration in one payload."""
    from ..services.memory import get_voice_chat_settings
    from ..voice_changer import get_voice_changer_port, is_voice_changer_running

    settings = get_voice_chat_settings()
    running = is_voice_changer_running()
    vc_pid = None
    if running:
        from .. import voice_changer as _vc_module

        vc_pid = getattr(_vc_module._vc_process, "pid", None)
    return {
        "running": running,
        "pid": vc_pid,
        "port": get_voice_changer_port() or settings.get("voice_changer_port"),
        "enabled": bool(settings.get("voice_changer_enabled")),
        "preset": _vc_app_setting(db, "voice_changer_preset") or "off",
        "profile_id": _vc_app_setting(db, "voice_changer_profile"),
        "effects": _VC_EFFECTS,
    }


@router.get("/voice-changer/effects")
async def voice_changer_effects():
    """Supported realtime effects and the available named presets."""
    return {"effects": _VC_EFFECTS, "presets": sorted(_VC_PRESETS), "max_chain_length": 4}


@router.post("/voice-changer/enable")
async def voice_changer_enable(body: VoiceChangerEnableRequest):
    """Toggle the voice changer: persists the setting and spawns/stops the service."""
    from ..services.memory import get_voice_chat_settings, save_voice_chat_settings
    from ..voice_changer import kill_voice_changer, spawn_voice_changer

    save_voice_chat_settings({"voice_changer_enabled": body.enabled})
    if body.enabled:
        port = get_voice_chat_settings().get("voice_changer_port") or 17494
        proc = spawn_voice_changer(port=int(port))
        if proc is None:
            raise HTTPException(status_code=503, detail=ERR_VOICE_CHANGER_FAILED)
        return {"enabled": True, "running": True, "port": int(port)}
    kill_voice_changer()
    return {"enabled": False, "running": False}


@router.post("/voice-changer/set-preset")
async def voice_changer_set_preset(body: VoiceChangerPresetRequest, db: Session = Depends(get_db)):
    """Persist the active effects preset for new voice-changer sessions."""
    _vc_set_app_setting(db, "voice_changer_preset", body.preset)
    return {"preset": body.preset, "saved": True}


@router.post("/voice-changer/set-profile")
async def voice_changer_set_profile(body: VoiceChangerProfileRequest, db: Session = Depends(get_db)):
    """Set (or clear with null) the target cloned-voice profile id."""
    _vc_set_app_setting(db, "voice_changer_profile", body.profile_id)
    return {"profile_id": body.profile_id, "saved": True}
