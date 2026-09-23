"""Scribe-shaped transcript JSON built from local engines (no cloud).

video-use's ``pack_transcripts.py`` consumes Scribe's word schema directly,
so this module normalizes local outputs into exactly that contract:
``words[]`` entries ``{text, start, end, type, speaker_id}`` with seconds,
``type`` in {word, spacing, audio_event}, and ``speaker_N`` IDs.

Sources: faster-whisper ``transcribe_with_words`` (milliseconds),
parakeet segments (seconds), Resemblyzer turns (speakers), YAMNet frames
(events). All functions are pure except ``audio_peak_dbfs`` (numpy in).
"""

from __future__ import annotations

import logging
import math
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# YAMNet display name -> pack token. Curated for takes work (speech-adjacent
# human sounds + music/crowd beds). Speech/Silence deliberately excluded:
# they are the signal, not events.
EVENT_VOCABULARY: dict[str, str] = {
    "Laughter": "laughter",
    "Baby laughter": "laughter",
    "Giggle": "laughter",
    "Chuckle, chortle": "laughter",
    "Belly laugh": "laughter",
    "Snicker": "laughter",
    "Applause": "applause",
    "Clapping": "clapping",
    "Cheering": "cheering",
    "Crowd": "crowd",
    "Sigh": "sigh",
    "Cough": "cough",
    "Throat clearing": "throat-clearing",
    "Sneeze": "sneeze",
    "Gasp": "gasp",
    "Crying, sobbing": "crying",
    "Music": "music",
    "Singing": "singing",
}

# Silence floor mirroring video-use's transcribe.py: below this, uploading
# (here: enriching) buys nothing.
SILENCE_DBFS = -60.0


def normalize_words(raw_words: list[dict], unit: str = "ms") -> list[dict]:
    """Map engine word dicts to ``{text, start, end}`` seconds.

    faster-whisper emits ``{word, start_ms, end_ms}`` (unit="ms");
    parakeet-style segments emit ``{text, start, end}`` seconds (unit="s").
    Empty text is dropped — the packer skips it anyway.
    """
    normalized = []
    for raw in raw_words:
        text = (raw.get("word", raw.get("text", "")) or "").strip()
        if not text:
            continue
        if unit == "ms":
            start = float(raw.get("start_ms", 0.0)) / 1000.0
            end = float(raw.get("end_ms", start * 1000.0)) / 1000.0
        else:
            start = float(raw.get("start", 0.0))
            end = float(raw.get("end", start))
        normalized.append({"text": text, "start": start, "end": end})
    return normalized


def synthesize_spacing(words: list[dict]) -> list[dict]:
    """Insert ``spacing`` entries for gaps (Scribe parity for phrase breaks)."""
    if not words:
        return []
    out = []
    for index, word in enumerate(words):
        out.append({**word, "type": word.get("type", "word")})
        if index + 1 < len(words):
            gap_start = word["end"]
            gap_end = words[index + 1]["start"]
            if gap_end > gap_start:
                out.append({"text": " ", "start": gap_start, "end": gap_end, "type": "spacing"})
    return out


def attach_speakers(words: list[dict], turns: list) -> list[dict]:
    """Add ``speaker_id`` per word; ``speaker_0`` when turns are unknown."""
    if not turns:
        return [{**w, "speaker_id": "speaker_0"} for w in words]
    from .diarization import align_words_to_speakers

    merged = align_words_to_speakers(words, turns)
    return [{**w, "speaker_id": w.get("speaker") or "speaker_0"} for w in merged]


def merge_event_tokens(frames: list[dict]) -> list[dict]:
    """Merge consecutive same-label event frames into single tokens.

    Frames are ``{start, end, label, score}``; runs separated by more than
    one YAMNet hop (0.48 s) stay split. Output is Scribe-shaped
    ``audio_event`` entries. ``score`` survives as the run maximum so
    downstream ranking (highlights) works without re-scoring.
    """
    tokens: list[dict] = []
    for frame in sorted(frames, key=lambda f: f["start"]):
        if tokens and tokens[-1]["text"] == frame["label"] and frame["start"] - tokens[-1]["end"] <= 0.48 + 1e-6:
            tokens[-1]["end"] = max(tokens[-1]["end"], frame["end"])
            tokens[-1]["score"] = max(tokens[-1].get("score", 0.0), frame.get("score", 0.0))
        else:
            tokens.append(
                {
                    "text": frame["label"],
                    "start": frame["start"],
                    "end": frame["end"],
                    "type": "audio_event",
                    "score": frame.get("score", 0.0),
                }
            )
    return tokens


def events_from_scores(
    frames: list[dict],
    class_names: list[str],
    threshold: float = 0.5,
) -> list[dict]:
    """Turn YAMNet per-frame scores into ``{start, end, label, score}`` frames.

    Only vocabulary classes at or above ``threshold`` survive; the top such
    class wins each frame. Speech/Silence are never events (see vocabulary).
    """
    events = []
    for frame in frames:
        best: tuple[str, float] | None = None
        for index, score in frame.get("scores", {}).items():
            name = class_names[index] if 0 <= index < len(class_names) else ""
            token = EVENT_VOCABULARY.get(name)
            if token is None or score < threshold:
                continue
            if best is None or score > best[1]:
                best = (token, float(score))
        if best is not None:
            events.append({"start": frame["start"], "end": frame["end"], "label": best[0], "score": best[1]})
    return events


def build_scribe_json(words: list[dict], events: list[dict] | None = None) -> dict:
    """Assemble the Scribe-shaped document: sorted entries + joined text.

    Every entry leaves with an explicit ``type`` so downstream readers
    (packers, renderers) never have to default it themselves.
    """
    entries = [{**w, "type": w.get("type", "word")} for w in words if w.get("type", "word") != "spacing"]
    if events:
        entries = entries + [{**e, "type": "audio_event"} for e in events]
    entries.sort(key=lambda w: (w["start"], w["end"]))
    text = " ".join(w["text"] for w in entries if w["type"] == "word")
    return {"text": text, "words": entries}


def audio_peak_dbfs(audio: np.ndarray) -> float:
    """Peak level in dBFS; -inf for digital silence."""
    peak = float(np.abs(np.asarray(audio, dtype=np.float32)).max(initial=0.0))
    if peak <= 0:
        return float("-inf")
    return 20.0 * math.log10(peak)


def words_json_path(audio_path: Path | str) -> Path:
    """Sidecar path for capture audio: ``<stem>.words.json`` next to it."""
    path = Path(audio_path)
    return path.parent / f"{path.stem}.words.json"


async def build_capture_words_json(
    audio_path: Path | str,
    language: str | None = None,
    num_speakers: int | None = None,
    event_threshold: float = 0.5,
) -> Path | None:
    """Transcribe words + speakers + events into a Scribe-shaped sidecar.

    Best-effort: returns the sidecar path, or None when nothing usable was
    produced (silent/missing audio, unavailable models, backend errors).
    An existing sidecar short-circuits (cache-if-exists).
    """
    import asyncio
    import json

    audio_path = Path(audio_path)
    sidecar = words_json_path(audio_path)
    if sidecar.exists():
        return sidecar
    if not audio_path.is_file():
        return None

    try:
        import soundfile as sf

        samples, sample_rate = sf.read(str(audio_path), dtype="float32")
    except Exception as exc:
        logger.debug("Words JSON skipped, unreadable audio %s: %s", audio_path, exc)
        return None
    if audio_peak_dbfs(np.asarray(samples)) < SILENCE_DBFS:
        logger.info("Words JSON skipped, silent audio %s", audio_path)
        return None

    try:
        from ..backends.faster_whisper_backend import FasterWhisperSTTBackend

        words = normalize_words(
            await FasterWhisperSTTBackend().transcribe_with_words(str(audio_path), language),
            unit="ms",
        )
    except Exception as exc:
        logger.debug("Words JSON skipped, word transcribe failed: %s", exc)
        return None
    if not words:
        return None

    try:
        from .diarization import diarize_turns

        turns = await asyncio.to_thread(diarize_turns, str(audio_path), num_speakers)
    except Exception as exc:
        logger.debug("Words JSON continuing without speakers: %s", exc)
        turns = []
    words = attach_speakers(words, turns)

    events: list[dict] = []
    try:
        from ..backends.yamnet_onnx_backend import yamnet_backend

        yamnet_backend.load_model()
        frames = await asyncio.to_thread(yamnet_backend.score_audio, np.asarray(samples), int(sample_rate))
        events = merge_event_tokens(events_from_scores(frames, yamnet_backend.class_names(), event_threshold))
    except Exception as exc:
        logger.debug("Words JSON continuing without events: %s", exc)

    doc = build_scribe_json(synthesize_spacing(words), events)
    try:
        sidecar.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.debug("Words JSON write failed %s: %s", sidecar, exc)
        return None
    return sidecar
