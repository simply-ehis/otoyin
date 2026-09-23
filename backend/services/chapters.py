"""Auto-chapters: segment a take on silence/music/applause boundaries.

Pure function over Scribe-shaped words: long silences split, applause runs
close the chapter, music runs of ``min_music_s`` or more get their own
labeled break. Titles come from the chapter's own words (never invented).
"""

from __future__ import annotations

import logging
from itertools import pairwise

logger = logging.getLogger(__name__)

# Events that close a chapter with a titled suffix.
_CLOSING_EVENTS = ("applause", "cheering")
# A run of this event spanning min_music_s opens its own labeled break.
_MUSIC_EVENT = "music"


def _is_event(token: dict) -> bool:
    return token.get("type") == "audio_event"


def _runs(tokens: list[dict]) -> list[dict]:
    """Merge consecutive same-label event tokens back into runs."""
    runs: list[dict] = []
    for token in tokens:
        if runs and runs[-1]["label"] == token["text"] and token["start"] - runs[-1]["end"] <= 0.48 + 1e-6:
            runs[-1]["end"] = max(runs[-1]["end"], token["end"])
        else:
            runs.append({"label": token["text"], "start": token["start"], "end": token["end"]})
    return runs


def _title(words: list[dict], events: list[dict]) -> str:
    head = " ".join(w["text"] for w in words[:6])
    suffixes = []
    for run in _runs([e for e in events if e["text"] in (*_CLOSING_EVENTS, _MUSIC_EVENT)]):
        label = run["label"]
        if label not in suffixes and len(suffixes) < 2:
            suffixes.append(label)
    if not head:
        return suffixes[0].capitalize() if len(suffixes) == 1 else ""
    if suffixes:
        return f"{head} ({', '.join(suffixes)})"
    return head


def build_chapters(
    words: list[dict],
    duration: float,
    min_silence_s: float = 3.0,
    min_music_s: float = 10.0,
) -> list[dict]:
    """Split words+events into ``[{index, title, start, end}]`` chapters."""
    tokens = sorted(
        [w for w in words if w.get("type", "word") in ("word", "audio_event")],
        key=lambda w: (w["start"], w["end"]),
    )
    if not tokens:
        return [{"index": 0, "title": "", "start": 0.0, "end": float(duration)}]

    # Boundary times: silence gaps, music-run edges, applause-run ends.
    breaks: set[float] = set()
    for prev, nxt in pairwise(tokens):
        if nxt["start"] - prev["end"] >= min_silence_s:
            breaks.add(float(prev["end"]))
    events = [t for t in tokens if _is_event(t)]
    for run in _runs(events):
        if run["label"] == _MUSIC_EVENT and run["end"] - run["start"] >= min_music_s:
            breaks.add(float(run["start"]))
            breaks.add(float(run["end"]))
        elif run["label"] in _CLOSING_EVENTS:
            breaks.add(float(run["end"]))

    chapters: list[dict] = []
    current: list[dict] = []
    current_start: float | None = None
    prev_end: float | None = None
    for token in tokens:
        if current and token["start"] in breaks and token["start"] > (current_start or 0.0):
            # Boundary at content start (a music run opens its own break):
            # close the previous chapter where its content ends.
            chapters.append((current_start, prev_end, current))
            current = []
        if not current:
            current_start = float(token["start"])
        current.append(token)
        if token["end"] in breaks:
            # Boundary at content end (silence gap, applause close).
            chapters.append((current_start, float(token["end"]), current))
            current = []
        prev_end = float(token["end"])
    if current:
        tail_end = max(float(duration), tokens[-1]["end"])
        chapters.append((current_start, tail_end, current))
    if not chapters:
        chapters.append((float(tokens[0]["start"]), float(duration), list(tokens)))

    result = []
    for index, (start, end, toks) in enumerate(chapters):
        words_only = [t for t in toks if not _is_event(t)]
        events_only = [t for t in toks if _is_event(t)]
        result.append(
            {
                "index": index,
                "title": _title(words_only, events_only),
                "start": start,
                "end": end,
            }
        )
    return result
