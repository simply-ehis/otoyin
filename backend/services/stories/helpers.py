"""
Shared helpers for story management.

Contains pure helper functions used across the stories service modules:
item-detail construction, audio-path resolution, audio fade application, and
generation-version creation.
"""

import logging
import math

import numpy as np
from sqlalchemy.orm import Session

from ...database import Generation as DBGeneration, GenerationVersion as DBGenerationVersion, StoryItem as DBStoryItem
from ...models import StoryItemDetail
from ..history import _get_versions_for_generation


def _build_item_detail(
    item: DBStoryItem,
    generation: DBGeneration,
    profile_name: str,
    db: Session,
) -> StoryItemDetail:
    """Build a StoryItemDetail with version info from a story item and its generation."""
    versions, active_version_id = _get_versions_for_generation(generation.id, db)

    # Resolve the audio path: if version_id is set, use that version's audio
    audio_path = generation.audio_path
    if item.version_id and versions:
        for v in versions:
            if v.id == item.version_id:
                audio_path = v.audio_path
                break

    return StoryItemDetail(
        id=item.id,
        story_id=item.story_id,
        generation_id=item.generation_id,
        version_id=getattr(item, "version_id", None),
        start_time_ms=item.start_time_ms,
        track=item.track,
        trim_start_ms=getattr(item, "trim_start_ms", 0),
        trim_end_ms=getattr(item, "trim_end_ms", 0),
        created_at=item.created_at,
        profile_id=generation.profile_id,
        profile_name=profile_name,
        text=generation.text,
        language=generation.language,
        audio_path=audio_path,
        duration=generation.duration,
        seed=generation.seed,
        instruct=generation.instruct,
        engine=generation.engine,
        volume=getattr(item, "volume", 1.0),
        fade_in_ms=getattr(item, "fade_in_ms", 0),
        fade_out_ms=getattr(item, "fade_out_ms", 0),
        gain_db=getattr(item, "gain_db", 0.0),
        pan=getattr(item, "pan", 0.0),
        generation_created_at=generation.created_at,
        versions=versions,
        active_version_id=active_version_id,
    )


def _get_audio_path_for_item(item: DBStoryItem, generation: DBGeneration, db: Session) -> str | None:
    """Resolve the audio file path for a story item."""
    if item.version_id:
        version = db.query(DBGenerationVersion).filter_by(id=item.version_id).first()
        if version:
            return version.audio_path
    return generation.audio_path


def _apply_pan(audio: np.ndarray, pan: float) -> np.ndarray:
    """Apply a stereo pan to mono or stereo audio.

    ``pan`` is clamped to ``[-1, 1]`` where ``-1`` is full left, ``0`` center,
    and ``1`` full right. Mono input is upmixed to stereo; stereo input is
    re-panned. Matches ``routes/audio.py:_apply_pan`` so live bounce and story
    export behave identically.
    """
    pan = max(-1.0, min(1.0, float(pan)))
    if pan == 0.0:
        return audio

    left = audio if audio.ndim == 1 else audio[:, 0]
    right = audio if audio.ndim == 1 else audio[:, 1]

    # Equal-power panning keeps perceived loudness constant across positions.
    # Snap extremes to exact 0/1 to avoid floating-point residuals (~6e-17) at full pan.
    if pan <= -1.0:
        left_gain, right_gain = 1.0, 0.0
    elif pan >= 1.0:
        left_gain, right_gain = 0.0, 1.0
    else:
        angle = (pan + 1.0) / 2.0 * math.pi / 2.0
        left_gain = math.cos(angle)
        right_gain = math.sin(angle)

    panned = np.zeros((len(left), 2), dtype=np.float32)
    panned[:, 0] = left * left_gain
    panned[:, 1] = right * right_gain
    return panned


def _apply_fade(audio: np.ndarray, sample_rate: int, fade_in_ms: int, fade_out_ms: int) -> np.ndarray:
    """Apply fade-in and fade-out to audio samples."""
    result = audio.copy()
    fade_in_samples = int(fade_in_ms / 1000.0 * sample_rate)
    fade_out_samples = int(fade_out_ms / 1000.0 * sample_rate)
    if fade_in_samples > 0 and len(result) > 0:
        fade_in_curve = np.linspace(0.0, 1.0, min(fade_in_samples, len(result)))
        result[: len(fade_in_curve)] *= fade_in_curve
    if fade_out_samples > 0 and len(result) > 0:
        fade_out_curve = np.linspace(1.0, 0.0, min(fade_out_samples, len(result)))
        result[-len(fade_out_curve) :] *= fade_out_curve
    return result


def _create_version(db: Session, generation: DBGeneration, label: str, audio_path: str) -> DBGenerationVersion:
    """Create a new generation version."""
    version = DBGenerationVersion(
        generation_id=generation.id,
        label=label,
        audio_path=audio_path,
    )
    db.add(version)
    db.flush()
    return version


def _resolve_profile_name(db: Session, generation: DBGeneration) -> str:
    """Resolve the voice profile name for a generation, defaulting to 'Unknown'."""
    from ...database import VoiceProfile as DBVoiceProfile

    profile = db.query(DBVoiceProfile).filter_by(id=generation.profile_id).first()
    return profile.name if profile else "Unknown"


def _load_clip_audio(item: DBStoryItem, generation: DBGeneration, db: Session, sample_rate: int):
    """Load and trim a story item's audio, returning (trimmed_audio, effective_duration_ms)."""
    from ... import config
    from ...utils.audio import load_audio

    resolved_audio_path = _get_audio_path_for_item(item, generation, db)
    audio_path = config.resolve_storage_path(resolved_audio_path)
    if audio_path is None or not audio_path.exists():
        return None, 0

    try:
        audio, sr = load_audio(str(audio_path), sample_rate=sample_rate)
        sample_rate = sr

        trim_start_ms = getattr(item, "trim_start_ms", 0)
        trim_end_ms = getattr(item, "trim_end_ms", 0)
        original_duration_ms = int(generation.duration * 1000)
        effective_duration_ms = original_duration_ms - trim_start_ms - trim_end_ms

        trim_start_sample = int((trim_start_ms / 1000.0) * sample_rate)
        trim_end_sample = int((trim_end_ms / 1000.0) * sample_rate)

        if trim_end_ms > 0:
            trimmed_audio = (
                audio[trim_start_sample:-trim_end_sample] if trim_end_sample > 0 else audio[trim_start_sample:]
            )
        else:
            trimmed_audio = audio[trim_start_sample:]

        volume = float(getattr(item, "volume", 1.0) or 1.0)
        if volume != 1.0:
            trimmed_audio = trimmed_audio * volume

        return trimmed_audio, effective_duration_ms
    except Exception as e:
        logging.getLogger(__name__).warning("Skipping story clip that failed to load: %s", e)
        return None, 0
