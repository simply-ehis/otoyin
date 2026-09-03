"""Pitch analysis endpoints."""

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config
from ..utils.async_audio import async_load_audio

router = APIRouter()


class PitchAnalysisRequest(BaseModel):
    audio_path: str
    sample_rate: int = 48000


class PitchSegment(BaseModel):
    start_sample: int
    end_sample: int
    frequency: float
    confidence: float
    midi_note: float
    note_name: str


def yin_detect(
    frame: np.ndarray, sample_rate: int, min_freq: float = 60.0, max_freq: float = 2000.0
) -> tuple[float, float]:
    """YIN pitch detection algorithm."""
    min_lag = int(sample_rate / max_freq)
    max_lag = int(sample_rate / min_freq)
    half_len = len(frame) // 2

    diff = np.zeros(half_len, dtype=np.float32)
    for tau in range(1, half_len):
        delta = frame[:half_len] - frame[tau : tau + half_len]
        diff[tau] = np.sum(delta * delta)

    cumsum = np.zeros(half_len, dtype=np.float32)
    cumsum[1] = diff[1]
    for i in range(2, half_len):
        cumsum[i] = cumsum[i - 1] + diff[i]

    threshold = 0.15
    best_tau = min_lag
    best_conf = 0.0

    for tau in range(min_lag, min(max_lag, half_len)):
        if diff[tau] == 0.0 or cumsum[tau] == 0.0:
            continue
        yin_val = diff[tau] * tau / cumsum[tau]
        if yin_val < threshold:
            best_tau = tau
            best_conf = 1.0 - yin_val

    freq = sample_rate / best_tau if best_conf > 0.0 else 0.0
    return freq, best_conf


def midi_to_note_name(midi: float) -> str:
    """Convert MIDI note number to note name."""
    notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    note_idx = round(midi) % 12
    octave = round(midi) // 12 - 1
    return f"{notes[note_idx]}{octave}"


def merge_segments(segments: list[dict]) -> list[dict]:
    """Merge consecutive segments with similar pitch."""
    if not segments:
        return []
    merged = [segments[0]]
    for seg in segments[1:]:
        prev = merged[-1]
        avg_freq = (prev["frequency"] + seg["frequency"]) / 2.0
        freq_diff = abs(prev["frequency"] - seg["frequency"])
        if avg_freq > 0 and freq_diff / avg_freq < 0.05 and seg["confidence"] > 0.3:
            merged[-1] = {
                "start_sample": prev["start_sample"],
                "end_sample": seg["end_sample"],
                "frequency": (prev["frequency"] + seg["frequency"]) / 2.0,
                "confidence": (prev["confidence"] + seg["confidence"]) / 2.0,
                "midi_note": (prev["midi_note"] + seg["midi_note"]) / 2.0,
                "note_name": midi_to_note_name((prev["midi_note"] + seg["midi_note"]) / 2.0),
            }
        else:
            merged.append(seg)
    return merged


@router.post("/audio/pitch-analysis", response_model=list[PitchSegment])
async def analyze_pitch(data: PitchAnalysisRequest):
    """Analyze pitch of an audio file using YIN algorithm."""
    audio_path = config.resolve_storage_path(data.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    try:
        audio, sample_rate = await async_load_audio(str(audio_path))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load audio: {e}") from e

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    frame_size = 2048
    hop_size = 512
    raw_segments = []

    pos = 0
    while pos + frame_size <= len(audio):
        frame = audio[pos : pos + frame_size]
        freq, conf = yin_detect(frame, sample_rate)
        midi = 69.0 + 12.0 * np.log2(freq / 440.0) if freq > 0 else 0.0
        raw_segments.append(
            {
                "start_sample": pos,
                "end_sample": pos + frame_size,
                "frequency": float(freq),
                "confidence": float(conf),
                "midi_note": float(midi),
                "note_name": midi_to_note_name(float(midi)),
            }
        )
        pos += hop_size

    merged = merge_segments(raw_segments)
    return [PitchSegment(**seg) for seg in merged]
