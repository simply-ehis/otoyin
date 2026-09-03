"""
Story audio processing operations.

Heavier audio operations: mixing/export, and non-destructive transforms that
produce a new generation version (normalize, reverse, remove silence).
"""

import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from sqlalchemy.orm import Session

from ... import config
from ...database import Generation as DBGeneration, Story as DBStory, StoryItem as DBStoryItem
from ...models import StoryItemDetail, StoryItemNormalize
from ...utils.audio import load_audio, save_audio
from .helpers import (
    _apply_fade,
    _apply_pan,
    _build_item_detail,
    _create_version,
    _load_clip_audio,
    _resolve_profile_name,
)


async def export_story_audio(
    story_id: str,
    db: Session,
) -> bytes | None:
    """Export story as single mixed audio file with timecode-based mixing."""
    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        return None

    items = (
        db.query(DBStoryItem, DBGeneration)
        .join(DBGeneration, DBStoryItem.generation_id == DBGeneration.id)
        .filter(DBStoryItem.story_id == story_id)
        .order_by(DBStoryItem.start_time_ms)
        .all()
    )

    if not items:
        return None

    audio_data = []
    sample_rate = 24000

    for item, generation in items:
        trimmed_audio, effective_duration_ms = _load_clip_audio(item, generation, db, sample_rate)
        if trimmed_audio is None:
            continue
        # Apply non-destructive per-clip gain (dB) and fades before mixing.
        gain_db = float(getattr(item, "gain_db", 0.0) or 0.0)
        if gain_db != 0.0:
            trimmed_audio = trimmed_audio * (10.0 ** (gain_db / 20.0))
        fade_in_ms = int(getattr(item, "fade_in_ms", 0) or 0)
        fade_out_ms = int(getattr(item, "fade_out_ms", 0) or 0)
        if fade_in_ms > 0 or fade_out_ms > 0:
            trimmed_audio = _apply_fade(trimmed_audio, sample_rate, fade_in_ms, fade_out_ms)
        # Apply per-clip stereo pan (non-destructive metadata) before mixing.
        pan = float(getattr(item, "pan", 0.0) or 0.0)
        if pan != 0.0:
            trimmed_audio = _apply_pan(trimmed_audio, pan)
        audio_data.append(
            {
                "audio": trimmed_audio,
                "start_time_ms": item.start_time_ms,
                "duration_ms": effective_duration_ms,
            }
        )

    if not audio_data:
        return None

    total_samples = max(
        (int((data["start_time_ms"] / 1000.0) * sample_rate) + len(data["audio"]) for data in audio_data),
        default=0,
    )
    # Story export is stereo so per-clip pan positions are preserved in the mix.
    final_audio = np.zeros((total_samples, 2), dtype=np.float32)

    for data in audio_data:
        audio = data["audio"]
        if audio.ndim == 1:
            audio = np.stack([audio, audio], axis=1)
        start_sample = int((data["start_time_ms"] / 1000.0) * sample_rate)
        audio_length = len(audio)
        end_sample = min(start_sample + audio_length, total_samples)

        if start_sample < total_samples:
            audio_to_mix = audio[: end_sample - start_sample]
            final_audio[start_sample:end_sample] += audio_to_mix

    max_val = np.abs(final_audio).max()
    if max_val > 1.0:
        final_audio = final_audio / max_val

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        save_audio(final_audio, tmp_path, sample_rate)
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
        return audio_bytes
    finally:
        Path(tmp_path).unlink(missing_ok=True)


async def normalize_story_item(
    story_id: str,
    item_id: str,
    data: StoryItemNormalize,
    db: Session,
) -> StoryItemDetail | None:
    """Normalize audio to target LUFS. Creates a new generation version."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation or not generation.audio_path:
        return None
    audio_path = config.resolve_storage_path(generation.audio_path)
    if audio_path is None or not audio_path.exists():
        return None
    audio, sample_rate = load_audio(str(audio_path))
    rms = np.sqrt(np.mean(audio**2))
    if rms <= 0.0:
        return None
    # Normalize to the requested integrated loudness (treated as an RMS/dBFS target),
    # matching the rest of the codebase's RMS-based normalize_audio helper.
    target_rms = 10.0 ** (data.target_lufs / 20.0)
    gain = target_rms / rms
    normalized = np.clip(audio * gain, -1.0, 1.0)
    new_path = config.get_generations_dir() / f"{generation.id}_normalized_{uuid.uuid4().hex[:8]}.wav"
    save_audio(normalized, str(new_path), sample_rate)
    version = _create_version(
        db, generation, f"Normalized to {data.target_lufs} LUFS", config.to_storage_path(new_path)
    )
    item.version_id = version.id
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def reverse_story_item(
    story_id: str,
    item_id: str,
    db: Session,
) -> StoryItemDetail | None:
    """Reverse audio. Creates a new generation version."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation or not generation.audio_path:
        return None
    audio_path = config.resolve_storage_path(generation.audio_path)
    if audio_path is None or not audio_path.exists():
        return None
    audio, sample_rate = load_audio(str(audio_path))
    reversed_audio = audio[::-1].copy()
    new_path = config.get_generations_dir() / f"{generation.id}_reversed_{uuid.uuid4().hex[:8]}.wav"
    save_audio(reversed_audio, str(new_path), sample_rate)
    version = _create_version(db, generation, "Reversed", config.to_storage_path(new_path))
    item.version_id = version.id
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)


async def remove_silence_from_story_item(
    story_id: str,
    item_id: str,
    db: Session,
) -> StoryItemDetail | None:
    """Remove silence from audio. Creates a new generation version."""
    item = db.query(DBStoryItem).filter_by(id=item_id, story_id=story_id).first()
    if not item:
        return None
    generation = db.query(DBGeneration).filter_by(id=item.generation_id).first()
    if not generation or not generation.audio_path:
        return None
    audio_path = config.resolve_storage_path(generation.audio_path)
    if audio_path is None or not audio_path.exists():
        return None
    audio, sample_rate = load_audio(str(audio_path))
    threshold = 0.01
    frame_size = int(0.02 * sample_rate)
    is_speech = []
    for i in range(0, len(audio), frame_size):
        frame = audio[i : i + frame_size]
        is_speech.append(np.abs(frame).max() > threshold)
    result_frames = []
    in_speech = False
    for i, speech in enumerate(is_speech):
        frame = audio[i * frame_size : (i + 1) * frame_size]
        if speech:
            result_frames.append(frame)
            in_speech = True
        elif in_speech:
            # Pad with actual short silence (not duplicated speech) at speech boundaries.
            silence_frames = min(5, max(1, int(0.05 * sample_rate) // frame_size))
            result_frames.extend([np.zeros(frame_size, dtype=audio.dtype) for _ in range(silence_frames)])
            in_speech = False
    if result_frames:
        result = np.concatenate(result_frames)
    else:
        result = audio
    new_path = config.get_generations_dir() / f"{generation.id}_no_silence_{uuid.uuid4().hex[:8]}.wav"
    save_audio(result, str(new_path), sample_rate)
    version = _create_version(db, generation, "Silence removed", config.to_storage_path(new_path))
    item.version_id = version.id
    story = db.query(DBStory).filter_by(id=story_id).first()
    if story:
        story.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return _build_item_detail(item, generation, _resolve_profile_name(db, generation), db)
