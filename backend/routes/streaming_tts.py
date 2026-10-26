"""Streaming text-to-speech endpoints via SSE.

Yields audio chunks as they are generated, so the frontend can start
playing the first chunk while remaining chunks generate.

The accumulated audio is also saved to disk so the result can be
replayed, downloaded, or added to generation history later.
"""

from __future__ import annotations

import base64
import json
import logging
import uuid

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import config
from ..backends import get_tts_backend_for_engine
from ..utils.audio import save_audio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tts/stream", tags=["streaming-tts"])


class StreamTTSRequest(BaseModel):
    text: str
    engine: str = "kokoro"
    voice_prompt: dict = {}
    language: str = "en"
    seed: int | None = None


@router.post("/")
async def stream_tts(request: StreamTTSRequest):
    """Stream TTS audio chunks as SSE events.

    Each event contains base64-encoded PCM audio for one chunk.
    The frontend can decode and play each chunk as it arrives.

    The final event (is_final=True) also includes the saved audio
    file path so the result can be replayed or added to history.
    """
    backend = get_tts_backend_for_engine(request.engine)
    if backend is None:
        raise HTTPException(status_code=404, detail=f"TTS engine '{request.engine}' not found")

    async def generate():
        accumulated = []
        sample_rate = 24000
        try:
            if hasattr(backend, "generate_stream"):
                async for audio, sr, is_final in backend.generate_stream(
                    text=request.text,
                    voice_prompt=request.voice_prompt,
                    language=request.language,
                    seed=request.seed,
                ):
                    sample_rate = sr
                    accumulated.append(audio)
                    audio_bytes = audio.tobytes() if hasattr(audio, "tobytes") else bytes(audio)
                    event = {
                        "audio": base64.b64encode(audio_bytes).decode("ascii"),
                        "sample_rate": sr,
                        "is_final": is_final,
                    }
                    yield f"data: {json.dumps(event)}\n\n"

                # Save accumulated audio to disk
                if accumulated:
                    full_audio = np.concatenate(accumulated) if len(accumulated) > 1 else accumulated[0]
                    audio_id = uuid.uuid4().hex[:12]
                    audio_path = str(config.get_generations_dir() / f"stream_{audio_id}.wav")
                    save_audio(full_audio, audio_path, sample_rate)
                    final_event = {
                        "audio": "",
                        "sample_rate": sample_rate,
                        "is_final": True,
                        "audio_path": audio_path,
                        "generation_id": audio_id,
                    }
                    yield f"data: {json.dumps(final_event)}\n\n"
            else:
                # Fallback: batch generate, then send as single chunk
                audio, sr = await backend.generate(
                    text=request.text,
                    voice_prompt=request.voice_prompt,
                    language=request.language,
                    seed=request.seed,
                )
                sample_rate = sr
                audio_bytes = audio.tobytes() if hasattr(audio, "tobytes") else bytes(audio)
                event = {
                    "audio": base64.b64encode(audio_bytes).decode("ascii"),
                    "sample_rate": sr,
                    "is_final": True,
                }
                yield f"data: {json.dumps(event)}\n\n"

                # Save audio to disk
                audio_id = uuid.uuid4().hex[:12]
                audio_path = str(config.get_generations_dir() / f"stream_{audio_id}.wav")
                save_audio(audio, audio_path, sr)
                final_event = {
                    "audio": "",
                    "sample_rate": sr,
                    "is_final": True,
                    "audio_path": audio_path,
                    "generation_id": audio_id,
                }
                yield f"data: {json.dumps(final_event)}\n\n"
        except Exception as exc:
            logger.exception("Streaming TTS failed")
            error_event = {"error": str(exc), "is_final": True}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")