"""Transcript-driven editing endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TranscriptWord(BaseModel):
    index: int
    word: str
    start_ms: float
    end_ms: float
    selected: bool = False


class DeleteWordsRequest(BaseModel):
    word_indices: list[int]
    crossfade_ms: int = 10


class DeleteWordsResponse(BaseModel):
    new_generation_id: str
    new_audio_path: str
    new_duration: float


@router.get("/transcript/{generation_id}/words")
async def get_word_timestamps(generation_id: str):
    """Get word-level timestamps for a generation's transcription."""
    from .. import config
    from ..backends import get_stt_backend
    from ..database import Generation as DBGeneration, get_db
    from ..utils.model_lifecycle import lifecycle_manager

    db = next(get_db())
    gen = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")

    resolved = config.resolve_storage_path(gen.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    stt = get_stt_backend("faster-whisper")
    lifecycle_manager.mark_model_used("faster-whisper")
    if not stt.is_loaded():
        # Try to load the default model (tiny.en)
        if not stt._is_model_cached("tiny.en"):
            raise HTTPException(
                status_code=400, detail="Whisper model not downloaded. Install 'whisper-tiny-en' from the Store."
            )
        await stt.load_model("tiny.en")

    words = await stt.transcribe_with_words(str(resolved))
    return {"words": words}


@router.post("/transcript/{generation_id}/click-word")
async def click_word(generation_id: str, word: TranscriptWord):
    """Handle a word click — returns the playhead position and region selection info."""
    return {
        "playhead_ms": word.start_ms,
        "select_start_ms": word.start_ms,
        "select_end_ms": word.end_ms,
        "word": word.word,
    }


@router.post("/transcript/{generation_id}/delete-words", response_model=DeleteWordsResponse)
async def delete_words(generation_id: str, request: DeleteWordsRequest):
    """Delete selected word spans from audio and create a new generation."""
    import asyncio
    import uuid

    import numpy as np

    from .. import config
    from ..backends import get_stt_backend
    from ..database import Generation as DBGeneration, get_db
    from ..models import Generation as GenModel
    from ..utils.audio import load_audio, save_audio
    from ..utils.model_lifecycle import lifecycle_manager

    db = next(get_db())
    gen = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")

    resolved = config.resolve_storage_path(gen.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Get word timestamps to map indices to time ranges
    stt = get_stt_backend("faster-whisper")
    lifecycle_manager.mark_model_used("faster-whisper")
    if not stt.is_loaded():
        if not stt._is_model_cached("tiny.en"):
            raise HTTPException(
                status_code=400, detail="Whisper model not downloaded. Install 'whisper-tiny-en' from the Store."
            )
        await stt.load_model("tiny.en")

    words_data = await stt.transcribe_with_words(str(resolved))
    words = words_data  # list of {word, start_ms, end_ms, confidence}

    # Validate word indices
    if not request.word_indices:
        raise HTTPException(status_code=400, detail="No word indices provided")

    for idx in request.word_indices:
        if idx < 0 or idx >= len(words):
            raise HTTPException(status_code=400, detail=f"Invalid word index: {idx}")

    # Build list of spans to remove (in samples)
    audio, sr = await asyncio.to_thread(load_audio, str(resolved), sample_rate=24000)
    total_samples = len(audio)

    # Convert word timestamps to sample indices
    spans_to_remove = []
    for idx in sorted(request.word_indices):
        w = words[idx]
        start_sample = int(w["start_ms"] / 1000.0 * sr)
        end_sample = int(w["end_ms"] / 1000.0 * sr)
        start_sample = max(0, min(start_sample, total_samples))
        end_sample = max(0, min(end_sample, total_samples))
        if end_sample > start_sample:
            spans_to_remove.append((start_sample, end_sample))

    if not spans_to_remove:
        raise HTTPException(status_code=400, detail="No valid spans to remove")

    # Merge overlapping/adjacent spans
    spans_to_remove.sort()
    merged_spans = [spans_to_remove[0]]
    for start, end in spans_to_remove[1:]:
        last_start, last_end = merged_spans[-1]
        if start <= last_end:
            merged_spans[-1] = (last_start, max(last_end, end))
        else:
            merged_spans.append((start, end))

    # Build the new audio by concatenating segments between removed spans
    crossfade_samples = int(request.crossfade_ms / 1000.0 * sr)
    segments = []
    prev_end = 0

    for start, end in merged_spans:
        if start > prev_end:
            segments.append(audio[prev_end:start])
        prev_end = end

    if prev_end < total_samples:
        segments.append(audio[prev_end:])

    # Concatenate with crossfade
    if len(segments) == 1:
        new_audio = segments[0]
    else:
        new_audio = segments[0]
        for seg in segments[1:]:
            if crossfade_samples > 0 and len(new_audio) >= crossfade_samples and len(seg) >= crossfade_samples:
                # Crossfade
                fade_out = np.linspace(1.0, 0.0, crossfade_samples)
                fade_in = np.linspace(0.0, 1.0, crossfade_samples)
                overlap = new_audio[-crossfade_samples:] * fade_out + seg[:crossfade_samples] * fade_in
                new_audio = np.concatenate([new_audio[:-crossfade_samples], overlap, seg[crossfade_samples:]])
            else:
                new_audio = np.concatenate([new_audio, seg])

    # Save as new generation (non-destructive)
    new_generation_id = str(uuid.uuid4())
    storage_dir = config.get_generations_dir()
    storage_dir.mkdir(parents=True, exist_ok=True)
    new_audio_path = storage_dir / f"{new_generation_id}.wav"

    await asyncio.to_thread(save_audio, new_audio, str(new_audio_path), sample_rate=sr)
    new_duration = len(new_audio) / sr

    # Create new generation record
    new_gen = GenModel(
        id=new_generation_id,
        user_id=gen.user_id,
        text=gen.text,  # keep original text for reference
        audio_path=str(new_audio_path.relative_to(config.get_data_dir())),
        engine=gen.engine,
        voice_id=gen.voice_id,
        language=gen.language,
        duration=new_duration,
        sample_rate=sr,
        meta=gen.meta,
    )
    db.add(new_gen)
    db.commit()

    return DeleteWordsResponse(
        new_generation_id=new_generation_id,
        new_audio_path=str(new_audio_path.relative_to(config.get_data_dir())),
        new_duration=new_duration,
    )
