"""Offline DSP / synthesizer endpoints (pre-AI synthesis, no models, no network).

Exposes the "Synth / DSP" tab: generate synthesized sounds and apply classical
DSP effects to stored audio (e.g. robotize an uploaded voice clip). All offline.
See worksheets/dsp-synth-plan.md and docs/knowledge/58-dsp-synth.md.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ... import config
from ...errors import ERR_AUDIO_NOT_FOUND, ERR_FILE_EMPTY, ERR_FILE_TOO_LARGE_MB, ERR_INTERNAL
from ...services import dsp_synth

router = APIRouter()

_SR = dsp_synth.SR

_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB
_ALLOWED_AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac", ".webm", ".opus"}


class SynthRequest(BaseModel):
    type: str = Field(default="subtractive", pattern="^(subtractive|fm|drum|chiptone|pluck|dialup|robot_speech)$")
    # generic params
    freq: float = Field(default=220.0, ge=20.0, le=8000.0)
    duration: float = Field(default=1.0, ge=0.05, le=20.0)
    note: str = "C4"
    wave: str = Field(default="saw", pattern="^(sine|square|saw|triangle|pwm)$")
    cutoff: float = Field(default=1200.0, ge=50.0, le=12000.0)
    resonance: float = Field(default=1.5, ge=0.0, le=10.0)
    attack: float = Field(default=0.02, ge=0.0, le=2.0)
    decay: float = Field(default=0.1, ge=0.0, le=2.0)
    sustain: float = Field(default=0.7, ge=0.0, le=1.0)
    release: float = Field(default=0.2, ge=0.0, le=3.0)
    kind: str = Field(default="kick", pattern="^(kick|snare|hihat|clap|tom|cymbal)$")
    text: str = Field(default="hello world", max_length=200)
    algorithm: int = Field(default=1, ge=1, le=5)
    feedback: float = Field(default=0.0, ge=0.0, le=5.0)


class EffectRequest(BaseModel):
    type: str = Field(
        default="vocoder",
        pattern="^(vocoder|bitcrush|distortion|tape|filter|delay|phaser|pitch|ringmod|reverb|robotize)$",
    )
    audio_path: str
    carrier_freq: float = Field(default=120.0, ge=20.0, le=4000.0)
    bits: int = Field(default=8, ge=1, le=16)
    drive: float = Field(default=3.0, ge=1.0, le=20.0)
    kind: str = Field(default="fuzz", max_length=40)
    cutoff: float = Field(default=1500.0, ge=20.0, le=12000.0)
    ftype: str = Field(default="lowpass", pattern="^(lowpass|highpass|bandpass)$")
    time: float = Field(default=0.25, ge=0.0, le=2.0)
    feedback: float = Field(default=0.5, ge=0.0, le=0.95)
    rate: float = Field(default=0.5, ge=0.01, le=10.0)
    depth: float = Field(default=0.8, ge=0.0, le=1.0)
    decay: float = Field(default=1.2, ge=0.1, le=6.0)
    wet: float = Field(default=0.3, ge=0.0, le=1.0)
    mod_freq: float = Field(default=100.0, ge=10.0, le=4000.0)


def _wav_response(audio: np.ndarray, filename: str) -> StreamingResponse:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, _SR, format="WAV")
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="audio/wav", headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


def _load_stored(audio_path: str) -> tuple[np.ndarray, int]:
    from ...utils.audio import load_audio

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    audio, sr = load_audio(str(resolved))
    audio = audio.mean(axis=1) if audio.ndim > 1 else audio
    return np.asarray(audio, dtype=np.float32), int(sr)


@router.post("/dsp/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    """Upload audio for offline DSP processing; returns a storage path."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_AUDIO_EXTS:
        ext = ".wav"
    name = f"dsp_{uuid.uuid4().hex}{ext}"
    path = config.get_captures_dir() / name
    total_size = 0
    with path.open("wb") as out:
        while chunk := await file.read(_UPLOAD_CHUNK_SIZE):
            total_size += len(chunk)
            if total_size > config.IMPORT_AUDIO_MAX_BYTES:
                out.close()
                path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=ERR_FILE_TOO_LARGE_MB,
                )
            out.write(chunk)
    if total_size == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=ERR_FILE_EMPTY)
    storage = config.to_storage_path(path)
    if storage is None:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=ERR_INTERNAL)
    return {"audio_path": str(storage), "size": total_size}


@router.get("/dsp/capabilities")
async def capabilities() -> dict:
    """List available synths and effects with their tunable parameters."""
    dsp_available = dsp_synth.is_dsp_available()
    return {
        "synthesizers": ["subtractive", "fm", "drum", "chiptone", "pluck", "dialup", "robot_speech"],
        "effects": [
            "vocoder",
            "bitcrush",
            "distortion",
            "tape",
            "filter",
            "delay",
            "phaser",
            "pitch",
            "ringmod",
            "reverb",
            "robotize",
        ],
        "offline": True,
        "ai": False,
        "api": False,
        "available": dsp_available,
    }


@router.post("/dsp/synth")
async def synth(req: SynthRequest) -> StreamingResponse:
    """Generate a synthesized sound (pure DSP, no models)."""
    if not dsp_synth.is_dsp_available():
        raise HTTPException(status_code=501, detail="audio-dsp package not installed — pip install audio-dsp")
    try:
        if req.type == "subtractive":
            audio = dsp_synth.synth_subtractive(
                req.freq,
                req.duration,
                req.wave,
                req.cutoff,
                req.resonance,
                req.attack,
                req.decay,
                req.sustain,
                req.release,
            )
        elif req.type == "fm":
            audio = dsp_synth.synth_fm(req.freq, req.duration, req.algorithm)
        elif req.type == "drum":
            audio = dsp_synth.synth_drum(req.kind, req.duration)
        elif req.type == "chiptone":
            audio = dsp_synth.synth_chiptone(req.note, req.duration)
        elif req.type == "pluck":
            audio = dsp_synth.synth_pluck(req.freq, req.duration)
        elif req.type == "dialup":
            audio = dsp_synth.synth_dialup(req.duration)
        else:
            audio = dsp_synth.synth_robot_speech(req.duration)
        return _wav_response(audio, f"dsp_{req.type}.wav")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/dsp/effect")
async def effect(req: EffectRequest) -> StreamingResponse:
    """Apply a classical DSP effect to a stored audio file."""
    if not dsp_synth.is_dsp_available():
        raise HTTPException(status_code=501, detail="audio-dsp package not installed — pip install audio-dsp")
    signal, sr = _load_stored(req.audio_path)
    try:
        if req.type == "vocoder":
            audio = dsp_synth.effect_vocoder(signal, sr, carrier_freq=req.carrier_freq)
        elif req.type == "bitcrush":
            audio = dsp_synth.effect_bitcrush(signal, bits=req.bits)
        elif req.type == "distortion":
            audio = dsp_synth.effect_distortion(signal, kind=req.kind, drive=req.drive)
        elif req.type == "tape":
            audio = dsp_synth.effect_tape(signal, sr, drive=req.drive)
        elif req.type == "filter":
            audio = dsp_synth.effect_filter(signal, sr, cutoff=req.cutoff, ftype=req.ftype)
        elif req.type == "delay":
            audio = dsp_synth.effect_delay(signal, sr, time=req.time, feedback=req.feedback)
        elif req.type == "phaser":
            audio = dsp_synth.effect_phaser(signal, sr, rate=req.rate, depth=req.depth)
        elif req.type == "pitch":
            audio = dsp_synth.effect_pitch(signal, sr, drift_depth=req.depth, rate=req.rate)
        elif req.type == "ringmod":
            audio = dsp_synth.effect_ringmod(signal, sr, mod_freq=req.mod_freq)
        elif req.type == "reverb":
            audio = dsp_synth.effect_reverb(signal, sr, decay=req.decay, wet=req.wet)
        else:
            audio = dsp_synth.robotize(signal, sr, carrier_freq=req.carrier_freq, bits=req.bits)
        return _wav_response(audio, f"dsp_effect_{req.type}.wav")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
