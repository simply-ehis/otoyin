"""Reference voice library — bundled celebrity voice clips for zero-shot cloning.

Provides a curated library of 30-second voice reference clips organized by
language. Each clip can be used as a voice cloning reference for compatible
TTS engines (Kokoro, Chatterbox, XTTSv2, F5-TTS, etc.).
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "reference_voices"


@dataclass
class ReferenceVoice:
    id: str
    name: str
    language: str
    category: str
    audio_path: str
    duration: float
    description: str


def _load_voices() -> list[ReferenceVoice]:
    """Load voice registry from voices.json."""
    manifest = _DATA_DIR / "voices.json"
    if not manifest.exists():
        logger.debug("Reference voices manifest not found at %s", manifest)
        return []

    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load reference voices manifest: %s", e)
        return []

    voices = []
    for entry in data.get("voices", []):
        audio_file = _DATA_DIR / entry["file"]
        if not audio_file.exists():
            continue

        voices.append(
            ReferenceVoice(
                id=entry["id"],
                name=entry["name"],
                language=entry.get("language", "en"),
                category=entry.get("category", "general"),
                audio_path=str(audio_file),
                duration=entry.get("duration", 30.0),
                description=entry.get("description", ""),
            )
        )
    return voices


_voices_cache: list[ReferenceVoice] | None = None


def get_voices() -> list[ReferenceVoice]:
    """Get all reference voices (cached)."""
    global _voices_cache
    if _voices_cache is None:
        _voices_cache = _load_voices()
    return _voices_cache


def list_voices(language: str | None = None) -> list[ReferenceVoice]:
    """List reference voices, optionally filtered by language."""
    voices = get_voices()
    if language:
        voices = [v for v in voices if v.language == language]
    return voices


def get_voice(voice_id: str) -> ReferenceVoice | None:
    """Get a reference voice by ID."""
    for v in get_voices():
        if v.id == voice_id:
            return v
    return None


def get_categories() -> list[str]:
    """Get all unique categories."""
    return sorted(set(v.category for v in get_voices()))


def manifest_voice_count() -> int:
    """Total entries in voices.json, regardless of downloaded audio."""
    manifest = _DATA_DIR / "voices.json"
    if not manifest.exists():
        return 0
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return 0
    return len(data.get("voices", []))


def pack_downloaded() -> bool:
    """True when the audio pack is present (at least one clip loaded).

    The UI shows a "Download voice pack" button instead of an empty grid
    when this is False.
    """
    return len(get_voices()) > 0


def get_languages() -> list[str]:
    """Get all unique languages."""
    return sorted(set(v.language for v in get_voices()))


def reload_voices() -> int:
    """Reload the voice registry and return count."""
    global _voices_cache
    _voices_cache = _load_voices()
    return len(_voices_cache)
