"""Mixer endpoints for multi-track mixing."""

import io

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import Generation as DBGeneration, Story as DBStory, StoryItem as DBStoryItem, get_db

router = APIRouter()


@router.post("/mixer/preview")
async def mixer_preview(
    data: models.MixerExportRequest,
    db: Session = Depends(get_db),
):
    """Preview mixed audio without saving."""
    story = db.query(DBStory).filter_by(id=data.story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    from ..services.effects_chain import EffectConfig
    from ..services.mixer import BusConfig, TrackConfig, mix_with_buses
    from ..utils.async_audio import async_load_audio

    items = db.query(DBStoryItem).filter_by(story_id=data.story_id).all()
    if not items:
        raise HTTPException(status_code=400, detail="No items in story")

    # Batch-load all generations to avoid N+1 queries
    gen_ids = [item.generation_id for item in items if item.generation_id]
    generations = db.query(DBGeneration).filter(DBGeneration.id.in_(gen_ids)).all()
    gen_map = {g.id: g for g in generations}

    # Load every item at its native sample rate first; we unify to a single
    # common rate before mixing so tracks with different SRs (e.g. a 24k
    # generation alongside a 48k imported clip) are not mis-pitched/truncated.
    loaded: list[tuple[np.ndarray, int, TrackConfig, int]] = []
    for item in items:
        gen = gen_map.get(item.generation_id)
        if not gen or not gen.audio_path:
            continue
        from .. import config as cfg

        audio_path = cfg.resolve_storage_path(gen.audio_path)
        if audio_path is None or not audio_path.exists():
            continue
        audio, sr = await async_load_audio(str(audio_path))
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        trim_start = int(getattr(item, "trim_start_ms", 0) / 1000.0 * sr)
        trim_end = int(getattr(item, "trim_end_ms", 0) / 1000.0 * sr)
        audio = audio[trim_start : len(audio) - trim_end] if trim_end > 0 else audio[trim_start:]

        effects = []
        for e in item.effects_chain or []:
            if isinstance(e, dict):
                effects.append(
                    EffectConfig(
                        effect_type=e.get("type", ""),
                        enabled=e.get("enabled", True),
                        params=e.get("params", {}),
                    )
                )

        track_cfg = TrackConfig(
            id=item.id,
            name=f"Track {item.track}",
            volume=getattr(item, "volume", 1.0),
            bus_id=None,
            effects_chain=effects,
        )
        start_sample = int(item.start_time_ms / 1000.0 * sr)
        loaded.append((audio, sr, track_cfg, start_sample))

    if not loaded:
        raise HTTPException(status_code=400, detail="No playable items in story")

    # Common target rate: prefer 48000, but fall back to the max native rate
    # if anything is higher (never downsample below source to avoid loss).
    sample_rate = 48000
    max_native = max(sr for _, sr, _, _ in loaded)
    if max_native > sample_rate:
        sample_rate = max_native

    track_data = []
    max_duration_samples = 0
    for audio, sr, track_cfg, start_sample in loaded:
        if sr != sample_rate:
            ratio = sample_rate / sr
            idx = (np.arange(round(len(audio) * ratio)) / ratio).astype(int).clip(0, len(audio) - 1)
            audio = audio[idx].astype(np.float32)
            start_sample = round(start_sample * ratio)
        track_data.append((audio, track_cfg))
        max_duration_samples = max(max_duration_samples, start_sample + len(audio))

    total_samples = max(max_duration_samples, sample_rate * 60)

    bus_data = {b.id: BusConfig(id=b.id, name=b.name, volume=b.volume, pan=b.pan) for b in data.mixer_state.buses}

    left, right = mix_with_buses(track_data, bus_data, sample_rate, total_samples, data.mixer_state.master_volume)

    import soundfile as sf

    stereo = np.stack([left, right], axis=1)
    buf = io.BytesIO()
    sf.write(buf, stereo, sample_rate, format="WAV")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="mix_preview.wav"'},
    )
