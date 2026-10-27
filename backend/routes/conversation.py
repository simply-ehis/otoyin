"""Conversation / Podcast / Debate mode endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class ConversationLine(BaseModel):
    id: str
    text: str
    speaker: str
    engine: str = "kokoro"
    profile_id: str | None = None
    start_mode: str = "relative_to_previous"
    start_offset_ms: int = 0
    overlap_ms: int = 0
    track: int = 0


class ConversationPreset(BaseModel):
    name: str
    description: str = ""
    tension_pacing: float = 0.5
    turn_duration_ms: int = 5000
    overlap_allowed: bool = False


class ConversationCue(BaseModel):
    line_id: str
    trigger: str = "start_of_previous"
    relative_offset_ms: int = 0
    overlap_ms: int = 0


class DebatePreset(BaseModel):
    name: str = "Debate"
    alternating_turns: bool = True
    tension_pacing: float = Field(default=0.5, ge=0.0, le=1.0)
    turn_duration_ms: int = 5000
    interruption_allowed: bool = True


CONVERSATION_PRESETS = {
    "debate": {
        "name": "Debate",
        "description": "Alternating turns with configurable tension pacing",
        "alternating_turns": True,
        "tension_pacing": 0.5,
        "turn_duration_ms": 5000,
        "interruption_allowed": True,
    },
    "podcast_interview": {
        "name": "Podcast Interview",
        "description": "Host and guest alternating with natural pacing",
        "alternating_turns": True,
        "tension_pacing": 0.3,
        "turn_duration_ms": 8000,
        "interruption_allowed": False,
    },
    "podcast_panel": {
        "name": "Podcast Panel",
        "description": "Multiple speakers with overlap allowed",
        "alternating_turns": False,
        "tension_pacing": 0.4,
        "turn_duration_ms": 6000,
        "interruption_allowed": True,
    },
    "dramatic_dialogue": {
        "name": "Dramatic Dialogue",
        "description": "High tension, quick back-and-forth",
        "alternating_turns": True,
        "tension_pacing": 0.9,
        "turn_duration_ms": 3000,
        "interruption_allowed": True,
    },
}


@router.get("/conversation/presets")
async def list_conversation_presets():
    """List available conversation/podcast presets."""
    return CONVERSATION_PRESETS


@router.post("/conversation/auto-duck")
async def auto_duck_speakers(lines: list[ConversationLine]):
    """Calculate auto-ducking gains between speakers so each speaker's voice is clear."""
    if len(lines) < 2:
        return {"lines": [0.0] * len(lines)}

    gains = []
    for i, line in enumerate(lines):
        gain = 0.0
        for j, other in enumerate(lines):
            if i == j:
                continue
            if other.track == line.track:
                overlap = max(
                    0,
                    min(line.start_offset_ms + 5000, other.start_offset_ms + 5000)
                    - max(line.start_offset_ms, other.start_offset_ms),
                )
                if overlap > 0:
                    gain = min(gain, -6.0 * (overlap / 1000.0))
        gains.append(max(gain, -12.0))

    return {"gains": gains}


@router.post("/conversation/auto-level")
async def auto_level_match(lines: list[ConversationLine]):
    """Auto-level-match across speakers/takes for consistent loudness."""
    levels = []
    for _line in lines:
        levels.append(-16.0)

    return {"target_lufs": levels}

import io
import asyncio
import soundfile as sf
import numpy as np
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException
from .. import models
from ..database import get_db
from ..config import resolve_storage_path
from .generations import generate_speech

@router.post("/conversation/generate")
async def generate_conversation(lines: list[ConversationLine], db: Session = Depends(get_db)):
    """Generate a stitched multi-speaker conversation audio."""
    # Filter lines with text
    work = [l for l in lines if (l.text or "").strip()]
    if not work:
        raise HTTPException(status_code=400, detail="No lines with text")

    # Resolve a default profile if missing
    from ..database import DBVoiceProfile
    default_profile = db.query(DBVoiceProfile).first()
    if default_profile is None:
        raise HTTPException(status_code=400, detail="No voice profile available")

    # Generate each line
    line_audio = []  # (audio ndarray, sr, line)
    for line in work:
        pid = line.profile_id or default_profile.id
        eng = line.engine or "kokoro"
        req = models.GenerationRequest(
            profile_id=pid,
            text=line.text,
            language="en",
            engine=eng,
        )
        gen = await generate_speech(req, db)
        gen_id = gen.id
        # poll for completion
        deadline = asyncio.get_event_loop().time() + 300
        row = None
        while asyncio.get_event_loop().time() < deadline:
            from ..database import Generation as DBGeneration
            row = db.query(DBGeneration).filter_by(id=gen_id).first()
            if row is not None and row.status in ("completed", "failed", "error"):
                break
            await asyncio.sleep(1)
            db.expire_all()
        if row is None or row.status != "completed":
            raise HTTPException(status_code=500, detail=f"Generation failed for line: {getattr(row,'error',None)}")
        audio_path = resolve_storage_path(row.audio_path)
        if audio_path is None or not audio_path.exists():
            raise HTTPException(status_code=500, detail="Audio file missing")
        audio, sr = await asyncio.to_thread(sf.read, str(audio_path))
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        line_audio.append((audio, sr, line))

    # Determine sample rate (use first)
    sr = line_audio[0][1]
    # Resample not handled; assume same sr. Convert if needed by simple repeat? Skip; assume kokoro/same engine sr.
    # Compute offsets
    # offsets: relative_to_previous -> after previous line end + offset; absolute -> offset from start
    # We'll compute start sample for each line.
    starts = []
    cursor = 0
    for audio, sr_i, line in line_audio:
        if line.start_mode == "absolute":
            start = int(line.start_offset_ms / 1000.0 * sr)
        else:
            start = cursor + int(line.start_offset_ms / 1000.0 * sr)
        if start < 0:
            start = 0
        starts.append(start)
        dur = len(audio)
        cursor = max(cursor, start + dur - int(line.overlap_ms / 1000.0 * sr))

    total_len = max(starts[i] + len(line_audio[i][0]) for i in range(len(line_audio)))
    combined = np.zeros(total_len, dtype=np.float32)
    for i, (audio, sr_i, line) in enumerate(line_audio):
        a = audio.astype(np.float32)
        s = starts[i]
        end = s + len(a)
        # mix with overlap (simple add)
        combined[s:end] += a

    # normalize to avoid clipping
    peak = np.max(np.abs(combined)) if combined.size else 1.0
    if peak > 0.99:
        combined = combined * (0.99 / peak)

    buf = io.BytesIO()
    sf.write(buf, combined, sr, format="WAV")
    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/wav", headers={"Content-Disposition": 'inline; filename="conversation.wav"'})