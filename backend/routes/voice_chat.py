"""
WebSocket endpoint for speech-to-speech voice chat.

Provides a real-time voice agent pipeline: VAD -> STT -> LLM -> TTS.
Connects to the voice_chat service for audio processing.

Protocol:
- Client sends JSON messages with type field:
  - "start": Initialize session with config
  - "audio": Send audio chunk (base64-encoded float32 PCM)
  - "end": End session
  - "cancel": Cancel current response (barge-in)

- Server sends JSON messages:
  - "started": Session created with session_id
  - "silence": No speech detected
  - "processing": Processing speech
  - "speech_started": VAD detected user speech
  - "speech_ended": User stopped speaking
  - "response": AI response with text and audio
  - "audio_delta": Streaming audio chunk
  - "error": Error message
  - "ended": Session ended
"""

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.vad import SileroVAD
from ..services.voice_chat import (
    MissingModelError,
    create_session,
    end_session,
    get_session,
    list_sessions,
    process_audio_chunk,
    resolve_tool_confirmation,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice-chat", tags=["voice-chat"])

# Allowed WebSocket origins for local-first app
_ALLOWED_WS_ORIGINS = {
    "http://localhost",
    "http://127.0.0.1",
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
}


def _is_allowed_origin(origin: str) -> bool:
    """Check if a WebSocket origin is allowed (local Tauri webview or localhost)."""
    from urllib.parse import urlparse

    try:
        parsed = urlparse(origin)
        base = f"{parsed.scheme}://{parsed.hostname}"
        return base in _ALLOWED_WS_ORIGINS or origin.startswith("http://localhost:")
    except Exception:
        logger.debug("Origin check failed: %s", origin)
        return False


# VAD config
VAD_THRESHOLD = 0.5
VAD_MIN_SPEECH_FRAMES = 5
VAD_MIN_SILENCE_FRAMES = 10
VAD_FRAME_SIZE = 512  # 32ms at 16kHz

# Streaming STT: send partial transcripts every N samples
PARTIAL_TRANSCRIPT_INTERVAL = 4000  # ~250ms at 16kHz


_KEEPALIVE_INTERVAL = 30  # seconds between pings


async def _keepalive_ping(websocket: WebSocket, stop_event: asyncio.Event) -> None:
    """Background task: send periodic ping to detect dead connections."""
    try:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=_KEEPALIVE_INTERVAL)
                break  # stop_event was set
            except TimeoutError:
                pass
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                logger.debug("Keepalive ping failed — connection dead")
                break
    except asyncio.CancelledError:
        pass


@router.websocket("/ws")
async def voice_chat_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time speech-to-speech voice chat.

    Supports Silero VAD for accurate turn-taking, barge-in for interrupting
    playback, and streaming audio output.
    """
    from ..services.rate_limiter import get_voice_chat_limiter

    # Validate origin to prevent cross-site WebSocket hijacking
    origin = websocket.headers.get("origin", "")
    if origin and not _is_allowed_origin(origin):
        await websocket.close(code=4403, reason="Origin not allowed")
        return

    limiter = get_voice_chat_limiter()

    # Check session limit
    allowed, reason = await limiter.can_open_session(websocket)
    if not allowed:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": reason})
        await websocket.close()
        return

    await websocket.accept()
    await limiter.register_session(websocket)
    session_id = None
    vad = SileroVAD(
        threshold=VAD_THRESHOLD,
        min_speech_frames=VAD_MIN_SPEECH_FRAMES,
        min_silence_frames=VAD_MIN_SILENCE_FRAMES,
    )
    audio_buffer: list[float] = []
    last_partial_transcript_pos = 0

    # Start keepalive ping
    _stop_keepalive = asyncio.Event()
    keepalive_task = asyncio.create_task(_keepalive_ping(websocket, _stop_keepalive))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "start":
                try:
                    session = await create_session(
                        language=message.get("language", "en"),
                        system_prompt=message.get("system_prompt"),
                        stt_model=message.get("stt_model", "base"),
                        tts_engine=message.get("tts_engine"),
                        enable_tools=message.get("enable_tools", True),
                    )
                except MissingModelError as missing:
                    # Preflight failed (no-downloads) — tell the client with
                    # the recommended pack instead of dying mid-turn.
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "missing_model",
                            "message": str(missing),
                            "recommended": missing.recommended,
                        }
                    )
                    continue
                session_id = session.session_id
                vad.reset()
                await websocket.send_json(
                    {
                        "type": "started",
                        "session_id": session_id,
                    }
                )

            elif msg_type == "audio":
                if not session_id:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "No active session. Send 'start' first.",
                        }
                    )
                    continue

                audio_data = message.get("audio", [])
                if not audio_data:
                    continue

                # Run VAD on the chunk
                import numpy as np

                chunk = np.array(audio_data, dtype=np.float32)
                vad_result = vad.detect(chunk)

                # Send VAD events
                if vad_result["speech_started"]:
                    await websocket.send_json({"type": "speech_started"})

                if vad_result["speech_ended"]:
                    await websocket.send_json({"type": "speech_ended"})

                # Accumulate audio during speech
                if vad_result["is_speech"]:
                    audio_buffer.extend(audio_data)

                    # Send partial transcripts periodically
                    if len(audio_buffer) - last_partial_transcript_pos >= PARTIAL_TRANSCRIPT_INTERVAL:
                        last_partial_transcript_pos = len(audio_buffer)
                        try:
                            from ..services.voice_chat import _transcribe_audio

                            session_obj = get_session(session_id)
                            if session_obj:
                                partial_text = await _transcribe_audio(
                                    audio_buffer,
                                    session_obj,
                                )
                                if partial_text:
                                    await websocket.send_json(
                                        {
                                            "type": "partial_transcript",
                                            "text": partial_text,
                                        }
                                    )
                        except Exception:
                            logger.debug("Partial transcript failed (best-effort)", exc_info=True)

                # Check if we have enough audio for processing
                if vad_result["speech_ended"] and len(audio_buffer) > 0:
                    # Check processing rate limit
                    can_proc, proc_reason = await limiter.can_process(websocket)
                    if not can_proc:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message": proc_reason,
                            }
                        )
                        audio_buffer.clear()
                        vad.reset()
                        continue

                    await limiter.register_processing(websocket)
                    try:
                        await websocket.send_json({"type": "processing"})

                        # Start processing as a task so we can receive
                        # confirm_tool/deny_tool messages while processing
                        processing_task = asyncio.create_task(process_audio_chunk(session_id, list(audio_buffer)))

                        # Continue receiving messages while processing
                        # (tool confirmations, cancels, etc.)
                        while not processing_task.done():
                            try:
                                inner_data = await asyncio.wait_for(
                                    websocket.receive_text(),
                                    timeout=0.1,
                                )
                                inner_msg = json.loads(inner_data)
                                inner_type = inner_msg.get("type")

                                if inner_type == "confirm_tool":
                                    sess = get_session(session_id) if session_id else None
                                    if sess and sess.tool_confirmation_future:
                                        resolve_tool_confirmation(sess, True)
                                    else:
                                        await websocket.send_json(
                                            {
                                                "type": "error",
                                                "message": "No pending tool confirmation.",
                                            }
                                        )

                                elif inner_type == "deny_tool":
                                    sess = get_session(session_id) if session_id else None
                                    if sess and sess.tool_confirmation_future:
                                        resolve_tool_confirmation(sess, False)
                                    else:
                                        await websocket.send_json(
                                            {
                                                "type": "error",
                                                "message": "No pending tool confirmation.",
                                            }
                                        )

                                elif inner_type == "cancel":
                                    sess = get_session(session_id) if session_id else None
                                    if sess and sess.playback_task:
                                        sess.playback_task.cancel()
                                        sess.is_playing_audio = False
                                        sess.playback_task = None
                                        await websocket.send_json({"type": "cancelled"})
                                    # Cancel the processing task
                                    processing_task.cancel()
                                    with contextlib.suppress(asyncio.CancelledError):
                                        await processing_task
                                    break

                            except TimeoutError:
                                # No message received, keep waiting
                                pass

                        # If processing completed successfully, send the result
                        if processing_task.cancelled():
                            audio_buffer.clear()
                            last_partial_transcript_pos = 0
                            vad.reset()
                        elif processing_task.done():
                            result = await processing_task

                            # Send response
                            await websocket.send_json(result)

                            # Send streaming audio chunks if available
                            if result.get("audio_chunks"):
                                for chunk_b64 in result["audio_chunks"]:
                                    await websocket.send_json(
                                        {
                                            "type": "audio_delta",
                                            "delta": chunk_b64,
                                        }
                                    )
                                await websocket.send_json({"type": "audio_done"})

                            # Clear buffer
                            audio_buffer.clear()
                            last_partial_transcript_pos = 0
                            vad.reset()
                        else:
                            # Task not done and not cancelled — shouldn't happen
                            audio_buffer.clear()
                            last_partial_transcript_pos = 0
                            vad.reset()

                    finally:
                        await limiter.unregister_processing()

            elif msg_type == "cancel":
                # Cancel current response (barge-in from client side)
                session = get_session(session_id) if session_id else None
                if session and session.playback_task:
                    session.playback_task.cancel()
                    session.is_playing_audio = False
                    session.playback_task = None
                    await websocket.send_json({"type": "cancelled"})

            elif msg_type == "end":
                if session_id:
                    await end_session(session_id)
                    await websocket.send_json({"type": "ended"})
                    session_id = None
                break

    except WebSocketDisconnect:
        logger.info("Voice chat WebSocket disconnected")
    except Exception as e:
        logger.error("Voice chat WebSocket error: %s", e)
        with contextlib.suppress(Exception):
            await websocket.send_json(
                {
                    "type": "error",
                    "message": "Internal server error",
                }
            )
    finally:
        _stop_keepalive.set()
        keepalive_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await keepalive_task
        if session_id:
            await end_session(session_id)
        await limiter.unregister_session(websocket)


@router.get("/status")
async def voice_chat_status():
    """Check if voice chat service is available."""
    sessions = list_sessions()
    return {
        "available": True,
        "active_sessions": len(sessions),
        "features": {
            "stt": True,
            "llm": True,
            "tts": True,
            "vad": True,
            "barge_in": True,
            "streaming_tts": True,
            "tool_calling": True,
        },
    }


@router.get("/sessions")
async def voice_chat_sessions():
    """List active voice chat sessions."""
    return {"sessions": list_sessions()}


@router.get("/metrics")
async def voice_chat_metrics():
    """Get voice chat pipeline metrics."""
    from ..services.observability import get_global_metrics

    return get_global_metrics().to_dict()
