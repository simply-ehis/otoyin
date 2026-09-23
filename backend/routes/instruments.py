"""Instrument and noise generation endpoints."""

import io

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..errors import ERR_INSTRUMENT_MISSING
from ..services.drum_machine import render_drum_pattern
from ..services.gm_instrument import render_gm_note
from ..services.instruments import (
    NOISE_TYPES,
    generate_drum_pad,
    generate_noise,
    generate_piano_note,
    generate_synth_note,
)

router = APIRouter()


class PianoNoteRequest(BaseModel):
    note: int = Field(..., ge=21, le=108)
    duration: float = Field(default=1.0, ge=0.1, le=10.0)
    velocity: float = Field(default=0.8, ge=0.0, le=1.0)


class DrumPadRequest(BaseModel):
    drum_type: str = Field(default="kick")
    duration: float = Field(default=0.5, ge=0.01, le=5.0)
    velocity: float = Field(default=0.8, ge=0.0, le=1.0)


class SynthNoteRequest(BaseModel):
    note: int = Field(..., ge=21, le=108)
    duration: float = Field(default=1.0, ge=0.1, le=10.0)
    waveform: str = Field(default="sawtooth")
    velocity: float = Field(default=0.8, ge=0.0, le=1.0)


class NoiseRequest(BaseModel):
    noise_type: str = Field(default="white")
    duration: float = Field(default=1.0, ge=0.1, le=30.0)
    amplitude: float = Field(default=0.5, ge=0.0, le=1.0)


class GMNoteRequest(BaseModel):
    program: int = Field(..., ge=0, le=127)
    note: int = Field(default=60, ge=21, le=108)
    duration: float = Field(default=1.0, ge=0.1, le=10.0)
    velocity: float = Field(default=0.8, ge=0.0, le=1.0)


class DrumMachineRequest(BaseModel):
    pattern: list = Field(
        ...,
        description="List of steps; each step is a voice name or list of voice names: kick/snare/hihat/clap/tom",
    )
    step_duration: float = Field(default=0.125, ge=0.02, le=1.0)
    bars: int = Field(default=1, ge=1, le=16)
    velocity: float = Field(default=0.8, ge=0.0, le=1.0)


def _audio_response(audio: np.ndarray, sample_rate: int, filename: str) -> StreamingResponse:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/instruments/piano")
async def play_piano_note(data: PianoNoteRequest):
    """Generate a piano note."""
    audio = generate_piano_note(data.note, data.duration, data.velocity)
    return _audio_response(audio, 48000, f"piano_{data.note}.wav")


@router.post("/instruments/drum")
async def play_drum_pad(data: DrumPadRequest):
    """Generate a drum sound."""
    audio = generate_drum_pad(data.drum_type, data.duration, data.velocity)
    return _audio_response(audio, 48000, f"drum_{data.drum_type}.wav")


@router.post("/instruments/synth")
async def play_synth_note(data: SynthNoteRequest):
    """Generate a synth note."""
    audio = generate_synth_note(data.note, data.duration, data.waveform, velocity=data.velocity)
    return _audio_response(audio, 48000, f"synth_{data.note}.wav")


@router.post("/instruments/noise")
async def generate_noise_endpoint(data: NoiseRequest):
    """Generate procedural noise."""
    audio = generate_noise(data.noise_type, data.duration, data.amplitude)
    return _audio_response(audio, 48000, f"noise_{data.noise_type}.wav")


@router.get("/instruments/noise-types")
async def list_noise_types():
    """List available noise types."""
    return [{"type": k, "description": v} for k, v in NOISE_TYPES.items()]


@router.get("/instruments/drum-types")
async def list_drum_types():
    """List available drum types."""
    return [
        {"type": "kick", "description": "Bass drum"},
        {"type": "snare", "description": "Snare drum"},
        {"type": "hihat", "description": "Hi-hat cymbal"},
        {"type": "clap", "description": "Hand clap"},
        {"type": "tom", "description": "Tom drum"},
    ]


@router.post("/instruments/gm")
async def play_gm_instrument(data: GMNoteRequest):
    """Render a General-MIDI instrument note (program 0-127) via a SoundFont."""
    try:
        audio = render_gm_note(data.program, data.note, data.duration, data.velocity)
    except RuntimeError:
        raise HTTPException(status_code=501, detail=ERR_INSTRUMENT_MISSING) from None
    return _audio_response(audio, 48000, f"gm_{data.program}_{data.note}.wav")


@router.post("/instruments/drum-machine")
async def play_drum_machine(data: DrumMachineRequest):
    """Render a 16-step (or N-step) drum pattern loop from synthesized drum hits."""
    audio = render_drum_pattern(data.pattern, data.step_duration, data.bars, velocity=data.velocity)
    return _audio_response(audio, 48000, "drum_machine.wav")


@router.get("/instruments/gm-types")
async def list_gm_types():
    """Describe the General-MIDI program range exposed by /instruments/gm."""
    return {
        "note": "General MIDI programs 0-127. Examples: 0 piano, 32 bass, 40 strings, "
        "56 trumpet, 73 pad, 112 tinkle bell. Requires a SoundFont: any "
        "instrument-pack bank from the Store, or an .sf2/.sf3 in data/soundfonts.",
    }
