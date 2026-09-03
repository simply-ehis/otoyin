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
