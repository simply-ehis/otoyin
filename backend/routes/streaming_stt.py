"""Streaming speech-to-text endpoints with VAD."""

import asyncio
import contextlib
import logging
import time
import uuid
from dataclasses import dataclass, field

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..errors import ERR_SESSION_NOT_FOUND
from ..services import transcribe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stt/stream", tags=["streaming-stt"])

SESSION_TIMEOUT_S = 300
DEFAULT_ENERGY_THRESHOLD = 0.02
SILENCE_FRAMES_TRIGGER = 8
# Force-finalize once this much audio is buffered without a VAD break —
# bounds memory for hot-mic / background-noise sessions where the
# silence trigger never fires.
MAX_UTTERANCE_SECONDS = 30


class StartSessionRequest(BaseModel):
    model_id: str = "base"
    language: str | None = None
    sample_rate: int = 16000
    vad_threshold: float = DEFAULT_ENERGY_THRESHOLD


class ChunkRequest(BaseModel):
    session_id: str
    audio: list[float]


class StopSessionRequest(BaseModel):
    session_id: str


class Segment(BaseModel):
    text: str
    start_ms: int
    end_ms: int


class StartSessionResponse(BaseModel):
    session_id: str


class ChunkResponse(BaseModel):
    text: str
    is_final: bool
    confidence: float
    energy: float = 0.0
    is_loud: bool = False


class StopSessionResponse(BaseModel):
    full_text: str
    segments: list[Segment]


class StatusResponse(BaseModel):
    active_sessions: int
    model_loaded: bool
    # Current VAD energy for active sessions (for VU meter)
    sessions: list[dict] = []


@dataclass
class StreamingSession:
    session_id: str
    model_id: str
    language: str | None
    sample_rate: int
    vad_threshold: float = DEFAULT_ENERGY_THRESHOLD
    audio_buffer: list[float] = field(default_factory=list)
    partial_text: str = ""
    segments: list[Segment] = field(default_factory=list)
    last_activity: float = field(default_factory=time.time)
    chunk_start_ms: int = 0
    silence_count: int = 0
    is_speaking: bool = False


_sessions: dict[str, StreamingSession] = {}


def _compute_energy(audio_chunk: list[float]) -> float:
    arr = np.array(audio_chunk, dtype=np.float32)
    if len(arr) == 0:
        return 0.0
    return float(np.sqrt(np.mean(arr**2)))


async def _cleanup_expired_sessions() -> None:
    now = time.time()
    expired = [sid for sid, s in _sessions.items() if now - s.last_activity > SESSION_TIMEOUT_S]
    for sid in expired:
        del _sessions[sid]


async def _transcribe_buffer(session: StreamingSession) -> str:
    buf = np.array(session.audio_buffer, dtype=np.float32)
    if len(buf) == 0:
        return ""
    import os
    import tempfile

    # Use NamedTemporaryFile so concurrent sessions never collide on the same path
    fd, tmp_path = tempfile.mkstemp(suffix=f"_stream_{session.session_id}.wav")
    os.close(fd)
    import soundfile as sf

    await asyncio.to_thread(sf.write, tmp_path, buf, session.sample_rate)
    try:
        model = transcribe.get_whisper_model()
        from ..utils.model_lifecycle import lifecycle_manager

        lifecycle_manager.mark_model_used("whisper")
        # Ensure model is entitled & loaded with correct size before transcribing
        from ..backends.configs import get_stt_model_configs
        from ..services.model_registry import is_downloaded

        cfg = next((c for c in get_stt_model_configs() if c.model_size == session.model_id), None)
        if cfg and cfg.engine != "cloud" and not is_downloaded(cfg.model_name, cfg.model_size):
            return ""
        if not model.is_loaded() or getattr(model, "model_size", None) != session.model_id:
            # Best-effort load; if not cached we return empty rather than failing
            try:
                await model.load_model_async(session.model_id)
            except Exception:
                logger.debug("suppressed exception in streaming_stt.py:138", exc_info=True)
                return ""
        text = await asyncio.to_thread(model.transcribe, tmp_path, session.language, session.model_id)
        return text.strip() if text else ""
    except Exception as e:
        logger.warning("Transcription failed for session %s: %s", session.session_id, e)
        return ""
    finally:
        with contextlib.suppress(OSError):
            os.remove(tmp_path)


@router.post("/start", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest):
    await _cleanup_expired_sessions()
    session_id = uuid.uuid4().hex[:12]
    _sessions[session_id] = StreamingSession(
        session_id=session_id,
        model_id=req.model_id,
        language=req.language,
        sample_rate=req.sample_rate,
        vad_threshold=req.vad_threshold,
    )
    return StartSessionResponse(session_id=session_id)


@router.post("/chunk", response_model=ChunkResponse)
async def send_chunk(req: ChunkRequest):
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)
    session.last_activity = time.time()
    energy = _compute_energy(req.audio)
    is_loud = energy > session.vad_threshold
    if is_loud:
        session.silence_count = 0
        session.is_speaking = True
    else:
        session.silence_count += 1

    session.audio_buffer.extend(req.audio)

    # VAD-triggered finalization: either we hit the silence threshold while speaking,
    # or we just transitioned from loud -> quiet (handles short utterances)
    should_finalize = False
    if session.is_speaking:
        if session.silence_count >= SILENCE_FRAMES_TRIGGER:
            should_finalize = True
        elif not is_loud and session.silence_count >= 1:
            # Immediate quiet after speech — short utterance path
            should_finalize = True
    # Hard cap: continuous audio above the VAD threshold never satisfies
    # the silence trigger, so the buffer would grow for the whole session
    # (last_activity keeps refreshing, defeating the 300 s idle expiry).
    if not should_finalize and len(session.audio_buffer) > session.sample_rate * MAX_UTTERANCE_SECONDS:
        should_finalize = True
    if should_finalize:
        text = await _transcribe_buffer(session)
        chunk_ms = int(len(session.audio_buffer) / session.sample_rate * 1000)
        if text:
            segment = Segment(
                text=text,
                start_ms=session.chunk_start_ms,
                end_ms=session.chunk_start_ms + chunk_ms,
            )
            session.segments.append(segment)
            session.partial_text = text
        session.chunk_start_ms += chunk_ms
        session.audio_buffer.clear()
        session.silence_count = 0
        session.is_speaking = False
        return ChunkResponse(
            text=text or "", is_final=True, confidence=0.9 if text else 0.0, energy=energy, is_loud=is_loud
        )

    return ChunkResponse(text="", is_final=False, confidence=0.0, energy=energy, is_loud=is_loud)


@router.post("/stop", response_model=StopSessionResponse)
async def stop_session(req: StopSessionRequest):
    session = _sessions.pop(req.session_id, None)
    if not session:
        raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)
    if session.audio_buffer:
        text = await _transcribe_buffer(session)
        chunk_ms = int(len(session.audio_buffer) / session.sample_rate * 1000)
        if text:
            segment = Segment(
                text=text,
                start_ms=session.chunk_start_ms,
                end_ms=session.chunk_start_ms + chunk_ms,
            )
            session.segments.append(segment)
    full_text = " ".join(s.text for s in session.segments)
    return StopSessionResponse(full_text=full_text, segments=session.segments)


@router.get("/status", response_model=StatusResponse)
async def stream_status():
    await _cleanup_expired_sessions()
    model = transcribe.get_whisper_model()
    sessions_info = []
    for sid, session in _sessions.items():
        sessions_info.append(
            {
                "session_id": sid,
                "model_id": session.model_id,
                "language": session.language,
                "is_speaking": session.is_speaking,
                "energy": 0.0,  # Will be updated by frontend from chunk responses
                "vad_threshold": session.vad_threshold,
            }
        )
    return StatusResponse(
        active_sessions=len(_sessions),
        model_loaded=model.is_loaded(),
        sessions=sessions_info,
    )
