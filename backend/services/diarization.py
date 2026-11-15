"""Speaker diarization service.

The Resemblyzer + Silero VAD + scikit-learn diarization stack was removed in
2026-11: it pulled a ~1-2 GB PyTorch model for functionality that was never
sellable on Windows (gated behind a Hugging Face token and a GPU-less CPU
runtime too slow for practical use).

``diarize_turns`` now always returns ``[]``. The alignment helpers
(:func:`align_speakers`, :func:`align_words_to_speakers`) remain — they are
pure overlap logic with no ML dependencies, used by dubbing, scribe-JSON,
and the MCP surface when turns are supplied by an external diarizer.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


def is_available() -> bool:
    """Diarization was removed (torch stack); always False."""
    return False


@dataclass
class SpeakerTurn:
    """One contiguous speech turn assigned to a speaker."""

    start: float
    end: float
    speaker: str


def diarize_turns(
    audio_path: str,
    num_speakers: int | None = None,
) -> list[SpeakerTurn]:
    """Return no speaker turns — diarization was removed.

    Callers already treat ``[]`` as "no speaker information" and fall back to
    single-speaker behavior.
    """
    logger.info("Diarization removed - returning no speaker turns for %s", audio_path)
    return []


def align_speakers(
    transcript_segments: list,
    speaker_turns: list[SpeakerTurn],
) -> list:
    """Assign each transcript segment the speaker of its best-overlap turn.

    ``transcript_segments`` items must expose ``start``/``end`` floats and a
    writable ``speaker`` attribute (mutated in place and returned).
    """
    if not speaker_turns:
        return transcript_segments

    for seg in transcript_segments:
        best_overlap = 0.0
        best_speaker = speaker_turns[0].speaker
        for turn in speaker_turns:
            overlap = max(0.0, min(seg.end, turn.end) - max(seg.start, turn.start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = turn.speaker
        seg.speaker = best_speaker

    return transcript_segments


def align_words_to_speakers(
    words: list[dict],
    speaker_turns: list[SpeakerTurn],
) -> list[dict]:
    """Assign each word dict the speaker of its best-overlap turn.

    Words carry ``start``/``end`` seconds. Unlike :func:`align_speakers` this
    returns NEW dicts (inputs untouched) with a ``speaker`` key added; words
    with no overlapping turn inherit the nearest turn, or ``None`` when there
    are no turns at all. Ties go to the earliest turn (stable output).
    """
    if not words:
        return []
    if not speaker_turns:
        return [dict(w) for w in words]

    merged = []
    for word in words:
        start = float(word.get("start", 0.0))
        end = float(word.get("end", start))
        best_overlap = 0.0
        best_speaker: str | None = None
        best_distance = float("inf")
        for turn in speaker_turns:
            overlap = max(0.0, min(end, turn.end) - max(start, turn.start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = turn.speaker
                best_distance = 0.0
            elif overlap == 0.0 and best_overlap == 0.0:
                # No overlap yet: track the nearest turn edge instead.
                distance = min(abs(start - turn.end), abs(end - turn.start))
                if distance < best_distance:
                    best_distance = distance
                    best_speaker = turn.speaker
        merged.append({**word, "speaker": best_speaker})
    return merged
