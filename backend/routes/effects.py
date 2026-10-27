"""Audio effects processing via Spotify Pedalboard."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ..backends.effects import (
    PEDALBOARD_AVAILABLE,
    process_audio,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/effects", tags=["effects"])


class ProcessEffectsRequest(BaseModel):
    audio_path: str
    sample_rate: int = 44100
    chain: list[dict] = []
    preset: str | None = None
    start_ms: float | None = None
    end_ms: float | None = None


@router.post("/process")
async def process_effects(request: ProcessEffectsRequest):
    """Process audio through an effect chain or preset."""
    if not PEDALBOARD_AVAILABLE:
        raise HTTPException(status_code=503, detail="pedalboard not installed")

    from .. import config

    audio_path = config.resolve_storage_path(request.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    audio_bytes = audio_path.read_bytes()
    try:
        result = process_audio(
            audio_bytes=audio_bytes,
            sample_rate=request.sample_rate,
            chain=request.chain,
            preset=request.preset,
            start_ms=request.start_ms,
            end_ms=request.end_ms,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(content=result, media_type="audio/wav")
