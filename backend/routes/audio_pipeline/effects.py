"""Audio effects, breath/pause control, inline editing, and tag endpoints.

Split from :mod:`audio` for maintainability.
"""

import asyncio
import logging
import uuid

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ... import config
from ...errors import (
    ERR_AUDIO_NOT_FOUND,
    ERR_EMPTY_OUTPUT,
    ERR_TAG_PREVIEW_FAILED,
    ERR_TAG_PROCESSING_FAILED,
    INFO_AUDIO_TAGS_DISABLED,
)
from ...utils.async_audio import async_load_audio

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_audio_path(audio_path: str) -> None:
    """Validate a stored audio path without loading audio data."""
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)


# ─── Emotion / Tone post-processing ────────────────────────────────────────


class EmotionToneRequest(BaseModel):
    audio_path: str
    warmth: float = 0.0
    energy: float = 0.0
    brightness: float = 0.0
    formant: float = 0.0


@router.post("/audio/emotion-tone")
async def emotion_tone_route(data: EmotionToneRequest):
    """Post-process audio with warmth, energy, brightness, and formant controls."""
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    from ...services.emotion_tone import apply_emotion_tone

    processed = await asyncio.to_thread(
        apply_emotion_tone,
        audio.astype(np.float32),
        sr,
        float(data.warmth),
        float(data.energy),
        float(data.brightness),
        float(data.formant),
    )

    import soundfile as sf

    out_name = f"emotion_{uuid.uuid4().hex[:8]}.wav"
    out_path = config.get_exports_dir() / out_name
    await asyncio.to_thread(lambda: sf.write(str(out_path), processed, sr))

    return {
        "output_path": config.to_storage_path(out_path),
        "filename": out_name,
        "duration_s": round(len(processed) / sr, 4),
        "sample_rate": sr,
    }


# ─── Breath & Pause Control ────────────────────────────────────────────────


class BreathPauseRequest(BaseModel):
    audio_path: str
    breath_intensity: float = 0.5
    pause_multiplier: float = 1.0
    use_prepared: bool = True


@router.post("/audio/breath-pause")
async def breath_pause_route(data: BreathPauseRequest):
    """Insert breath sounds at pause points and scale pause durations."""
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    from ...services.breath_pause import insert_breaths

    processed = await asyncio.to_thread(
        insert_breaths,
        audio.astype(np.float32),
        sr,
        float(data.breath_intensity),
        float(data.pause_multiplier),
        None,
        bool(data.use_prepared),
    )

    import soundfile as sf

    out_name = f"breath_{uuid.uuid4().hex[:8]}.wav"
    out_path = config.get_exports_dir() / out_name
    await asyncio.to_thread(lambda: sf.write(str(out_path), processed, sr))

    return {
        "output_path": config.to_storage_path(out_path),
        "filename": out_name,
        "duration_s": round(len(processed) / sr, 4),
        "sample_rate": sr,
    }


class AdjustPausesRequest(BaseModel):
    audio_path: str
    min_pause_ms: float = 200.0
    max_pause_ms: float = 1500.0
    target_pause_ms: float | None = None


@router.post("/audio/adjust-pauses")
async def adjust_pauses_route(data: AdjustPausesRequest):
    """Adjust pause durations: extend short pauses, trim long pauses."""
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    from ...services.breath_pause import adjust_pauses

    processed = await asyncio.to_thread(
        adjust_pauses,
        audio.astype(np.float32),
        sr,
        float(data.min_pause_ms),
        float(data.max_pause_ms),
        float(data.target_pause_ms) if data.target_pause_ms is not None else None,
    )

    import soundfile as sf

    out_name = f"pauses_{uuid.uuid4().hex[:8]}.wav"
    out_path = config.get_exports_dir() / out_name
    await asyncio.to_thread(lambda: sf.write(str(out_path), processed, sr))

    return {
        "output_path": config.to_storage_path(out_path),
        "filename": out_name,
        "duration_s": round(len(processed) / sr, 4),
        "sample_rate": sr,
    }


# ─── Inline waveform editing ────────────────────────────────────────────────


class FadeRequest(BaseModel):
    audio_path: str
    duration_ms: float = 100.0
    start_ms: float | None = None
    end_ms: float | None = None


@router.post("/audio/fade-in")
async def fade_in_route(data: FadeRequest):
    """Apply fade-in."""
    _validate_audio_path(data.audio_path)
    from ...services.audio_edit import fade_in

    return fade_in(
        data.audio_path,
        float(data.duration_ms),
        float(data.start_ms) if data.start_ms is not None else 0.0,
    )


@router.post("/audio/fade-out")
async def fade_out_route(data: FadeRequest):
    """Apply fade-out."""
    _validate_audio_path(data.audio_path)
    from ...services.audio_edit import fade_out

    return fade_out(
        data.audio_path,
        float(data.duration_ms),
        float(data.end_ms) - float(data.duration_ms) if data.end_ms is not None else None,
    )


class RegionRequest(BaseModel):
    audio_path: str
    start_ms: float
    end_ms: float


@router.post("/audio/splice")
async def splice_route(data: RegionRequest):
    """Keep only the region between start_ms and end_ms."""
    _validate_audio_path(data.audio_path)
    from ...services.audio_edit import splice

    return splice(data.audio_path, float(data.start_ms), float(data.end_ms))


@router.post("/audio/delete-region")
async def delete_region_route(data: RegionRequest):
    """Remove the region between start_ms and end_ms."""
    _validate_audio_path(data.audio_path)
    from ...services.audio_edit import delete_region

    return delete_region(data.audio_path, float(data.start_ms), float(data.end_ms))


class InsertSilenceRequest(BaseModel):
    audio_path: str
    position_ms: float
    duration_ms: float


@router.post("/audio/insert-silence")
async def insert_silence_route(data: InsertSilenceRequest):
    """Insert silence at the given position."""
    _validate_audio_path(data.audio_path)
    from ...services.audio_edit import insert_silence

    return insert_silence(data.audio_path, float(data.position_ms), float(data.duration_ms))


# ─── Silence trimmer ────────────────────────────────────────────────────────


class SilenceTrimRequest(BaseModel):
    audio_path: str
    threshold_db: float = -40.0
    min_silence_ms: float = 200.0
    fade_ms: float = 30.0


@router.post("/audio/trim-silence")
async def trim_silence_route(data: SilenceTrimRequest):
    """Trim leading/trailing silence and apply fade-out."""
    _validate_audio_path(data.audio_path)
    resolved = config.resolve_storage_path(data.audio_path)
    audio, sr = await async_load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    from ...utils.audio import trim_tts_output

    processed = await asyncio.to_thread(
        trim_tts_output,
        audio.astype(np.float32),
        sr,
        20,
        float(data.threshold_db),
        float(data.min_silence_ms),
        1000,
        float(data.fade_ms),
    )

    import soundfile as sf

    out_name = f"trimmed_{uuid.uuid4().hex[:8]}.wav"
    out_path = config.get_exports_dir() / out_name
    await asyncio.to_thread(lambda: sf.write(str(out_path), processed, sr))

    return {
        "output_path": config.to_storage_path(out_path),
        "filename": out_name,
        "duration_s": round(len(processed) / sr, 4),
        "sample_rate": sr,
    }


# ─── Audio Tags ──────────────────────────────────────────────────────────────


class AudioTagRequest(BaseModel):
    text: str = Field(max_length=10000)
    engine: str = "kokoro"
    voice: str | None = None
    language: str = "en"
    sample_rate: int = 24000
    crossfade_ms: float = 20.0


@router.post("/audio/apply-tags")
async def apply_audio_tags_route(data: AudioTagRequest):
    """Apply bracketed audio tags to text using any TTS engine."""
    from ...database import get_db
    from ...database.models import GenerationSettings

    db = get_db()
    gen_settings = db.query(GenerationSettings).first()
    if not gen_settings or not gen_settings.audio_tags_enabled:
        raise HTTPException(
            status_code=400,
            detail=INFO_AUDIO_TAGS_DISABLED,
        )

    from ...services.audio_tags import apply_audio_tags, parse_tags

    segments = parse_tags(data.text)
    has_tags = any(s.is_tag for s in segments)

    if not has_tags:
        raise HTTPException(
            status_code=400,
            detail="No audio tags found. Use bracketed tags like [pause], [laughs], [sigh].",
        )

    from ...backends import get_tts_backend
    from ...utils.model_lifecycle import lifecycle_manager

    backend = get_tts_backend()
    lifecycle_manager.mark_model_used(data.engine)

    async def tts_fn(text: str, sr: int) -> tuple[np.ndarray, int]:
        voice_prompt = {"preset_voice_id": data.voice} if data.voice else {}
        return await backend.generate(
            text=text,
            voice_prompt=voice_prompt,
            language=data.language,
        )

    try:
        audio, sr = await apply_audio_tags(
            data.text,
            tts_fn,
            data.sample_rate,
            data.crossfade_ms,
            engine=data.engine,
        )
    except Exception as e:
        logger.exception("Audio tag processing failed")
        raise HTTPException(status_code=500, detail=ERR_TAG_PROCESSING_FAILED) from e

    if len(audio) == 0:
        raise HTTPException(status_code=400, detail=ERR_EMPTY_OUTPUT)

    import soundfile as sf

    out_name = f"tagged_{uuid.uuid4().hex[:8]}.wav"
    out_path = config.get_exports_dir() / out_name
    await asyncio.to_thread(lambda: sf.write(str(out_path), audio, sr))

    return {
        "output_path": config.to_storage_path(out_path),
        "filename": out_name,
        "duration_s": round(len(audio) / sr, 4),
        "sample_rate": sr,
        "tags_found": len([s for s in segments if s.is_tag]),
    }


@router.get("/audio/tags")
async def list_audio_tags():
    """List all supported audio tags with durations and sample availability."""
    from ...services.audio_sample_library import get_manifest
    from ...services.audio_tags import list_supported_tags

    tags = list_supported_tags()
    manifest = get_manifest()

    for tag_name, tag_info in tags.items():
        if tag_name in manifest:
            tag_info["has_samples"] = manifest[tag_name]["has_samples"]
            tag_info["sample_count"] = manifest[tag_name]["count"]
            tag_info["variants"] = manifest[tag_name]["variants"]
        else:
            tag_info["has_samples"] = False
            tag_info["sample_count"] = 0
            tag_info["variants"] = []

    return tags


@router.get("/audio/emotion-presets")
async def list_emotion_presets():
    """List all available emotion presets with their DSP parameters."""
    from ...services.audio_tags import list_emotion_presets as _list

    return _list()


@router.get("/audio/sample-manifest")
async def sample_manifest():
    """Return the full sample library manifest for the frontend."""
    from ...services.audio_sample_library import get_manifest

    return get_manifest()


class TagPreviewRequest(BaseModel):
    tag: str
    modifiers: list[str] = []
    sample_rate: int = 24000


@router.post("/audio/tag-preview")
async def preview_tag_audio(data: TagPreviewRequest):
    """Generate a preview of a single audio tag (no TTS needed)."""
    from ...database import get_db
    from ...database.models import GenerationSettings

    db = get_db()
    gen_settings = db.query(GenerationSettings).first()
    if not gen_settings or not gen_settings.audio_tags_enabled:
        raise HTTPException(
            status_code=400,
            detail=INFO_AUDIO_TAGS_DISABLED,
        )

    from ...services.audio_sample_library import get_library
    from ...services.audio_tags import ParsedTag, generate_tag_audio

    tag_name = data.tag.lower().strip()
    dsp_tags = {
        "pause",
        "short pause",
        "long pause",
        "whisper",
        "shout",
        "breath",
        "breaths",
        "gasp",
        "tsk",
        "laughs",
        "chuckles",
        "giggles",
        "hmmm",
        "sigh",
        "cough",
        "yawn",
        "gulps",
        "umm",
        "uhh",
    }
    lib = get_library()
    known = dsp_tags | (set(lib.available_tags) if lib else set())
    if tag_name not in known:
        raise HTTPException(status_code=400, detail=f"Unknown tag: {tag_name}. Valid tags: {sorted(known)}")

    tag = ParsedTag(tag=tag_name, modifiers=[m.lower().strip() for m in data.modifiers])

    try:
        audio = await asyncio.to_thread(generate_tag_audio, tag, data.sample_rate)
    except Exception as e:
        logger.exception("Tag preview failed")
        raise HTTPException(status_code=500, detail=ERR_TAG_PREVIEW_FAILED) from e

    import soundfile as sf

    out_name = f"tag_preview_{tag.tag.replace(' ', '_')}_{uuid.uuid4().hex[:6]}.wav"
    out_path = config.get_exports_dir() / out_name
    await asyncio.to_thread(lambda: sf.write(str(out_path), audio, data.sample_rate))

    return {
        "output_path": config.to_storage_path(out_path),
        "filename": out_name,
        "duration_s": round(len(audio) / data.sample_rate, 4),
        "sample_rate": data.sample_rate,
    }
