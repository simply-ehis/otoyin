"""FastAPI server for the headless voice-changer service.

Lightweight standalone server exposing a single WebSocket endpoint that
speaks the OpenAI Realtime protocol. No REST API, no database, no SPA —
just the voice-change pipe.

Usage:
    python -m backend.voice_changer          # default port 17494
    python -m backend.voice_changer --port 17495
"""

import asyncio
import base64
import contextlib
import json
import logging
import uuid
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

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
        return False


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    app = FastAPI(title="otoyin Voice Changer", version="1.0.0")
    app.add_api_websocket_route("/voice-changer/ws", voice_changer_ws)
    return app


# ---------------------------------------------------------------------------
# Per-connection state
# ---------------------------------------------------------------------------


class _Session:
    __slots__ = (
        "_pipeline",
        "_process_task",
        "_state",
        "audio_buffer",
        "denoise",
        "enhance",
        "is_processing",
        "language",
        "session_id",
        "tts_engine",
        "voice",
    )

    def __init__(self) -> None:
        self.session_id = str(uuid.uuid4())
        self.voice = "default"
        self.tts_engine = "kokoro"
        self.language = "en"
        self.denoise = True
        self.enhance = True
        self.audio_buffer: list[float] = []
        self.is_processing = False
        self._pipeline = None
        self._state = None
        self._process_task: asyncio.Task | None = None

    def get_pipeline(self):
        from .pipeline import PipelineConfig, PipelineState, VoiceChangerPipeline

        if self._pipeline is None:
            cfg = PipelineConfig(
                target_voice=self.voice,
                tts_engine=self.tts_engine,
                denoise=self.denoise,
                enhance=self.enhance,
                language=self.language,
            )
            self._pipeline = VoiceChangerPipeline(cfg)
            self._state = PipelineState()
        return self._pipeline, self._state


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _send(ws: WebSocket, event: dict[str, Any]) -> None:
    await ws.send_text(json.dumps(event))


async def _process_committed(ws: WebSocket, session: _Session) -> None:
    """Run the full voice-change pipeline on buffered audio."""
    if session.is_processing or not session.audio_buffer:
        return

    session.is_processing = True
    pipeline, state = session.get_pipeline()

    try:
        # Send acknowledgement
        response_id = f"resp_{uuid.uuid4().hex[:12]}"
        await _send(
            ws,
            {
                "type": "response.created",
                "response": {"id": response_id, "object": "response", "status": "in_progress"},
            },
        )

        # Run pipeline in thread (CPU-bound)
        audio_data = list(session.audio_buffer)
        session.audio_buffer.clear()

        loop = asyncio.get_running_loop()
        output_audio, info = await loop.run_in_executor(
            None, lambda: pipeline.process_chunk(np.array(audio_data, dtype=np.float32), state)
        )

        # Stream result
        if output_audio and len(output_audio) > 0:
            out_np = np.array(output_audio, dtype=np.float32)
            # Encode as int16 PCM base64
            pcm_int16 = (np.clip(out_np, -1.0, 1.0) * 32767).astype(np.int16)
            b64_audio = base64.b64encode(pcm_int16.tobytes()).decode("ascii")

            await _send(
                ws,
                {
                    "type": "response.audio.delta",
                    "response_id": response_id,
                    "delta": b64_audio,
                },
            )

        if info.get("transcript"):
            await _send(
                ws,
                {
                    "type": "conversation.item.created",
                    "item": {
                        "id": f"item_{uuid.uuid4().hex[:12]}",
                        "object": "conversation.item",
                        "role": "user",
                        "content": [{"type": "input_audio_transcript", "transcript": info["transcript"]}],
                    },
                },
            )

        await _send(
            ws,
            {
                "type": "response.audio.done",
                "response_id": response_id,
            },
        )
        await _send(
            ws,
            {
                "type": "response.done",
                "response": {"id": response_id, "object": "response", "status": "completed"},
            },
        )

    except Exception as exc:
        logger.debug("Pipeline error: %s", exc, exc_info=True)
        await _send(
            ws,
            {
                "type": "error",
                "error": {"type": "server_error", "message": "Internal server error"},
            },
        )
    finally:
        session.is_processing = False


_KEEPALIVE_INTERVAL = 30  # seconds between pings


async def _keepalive_ping(ws: WebSocket, stop_event: asyncio.Event) -> None:
    """Background task: send periodic ping to detect dead connections."""
    try:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=_KEEPALIVE_INTERVAL)
                break
            except TimeoutError:
                pass
            try:
                await _send(ws, {"type": "ping", "event_id": "keepalive"})
            except Exception:
                logger.debug("Keepalive ping failed — connection dead")
                break
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


async def voice_changer_ws(websocket: WebSocket) -> None:
    """OpenAI Realtime-compatible WebSocket for real-time voice changing.

    Protocol:
      Client → Server: session.update, input_audio_buffer.append,
                       input_audio_buffer.commit, input_audio_buffer.clear,
                       response.cancel, ping
      Server → Client: session.created, session.updated, response.created,
                       response.audio.delta, response.audio.done, response.done,
                       conversation.item.created, pong, error
    """
    # Validate origin to prevent cross-site WebSocket hijacking
    origin = websocket.headers.get("origin", "")
    if origin and not _is_allowed_origin(origin):
        await websocket.close(code=4403, reason="Origin not allowed")
        return

    await websocket.accept()
    session = _Session()

    # Start keepalive ping
    _stop_keepalive = asyncio.Event()
    keepalive_task = asyncio.create_task(_keepalive_ping(websocket, _stop_keepalive))

    # Send initial session
    await _send(
        websocket,
        {
            "type": "session.created",
            "session": {
                "id": session.session_id,
                "object": "session",
                "model": "voice-changer-v1",
                "voice": session.voice,
                "modalities": ["audio"],
            },
        },
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError as e:
                await _send(websocket, {"type": "error", "error": {"type": "invalid_message", "message": str(e)}})
                continue
            msg_type = msg.get("type", "")

            if msg_type == "session.update":
                s = msg.get("session", {})
                if "voice" in s:
                    session.voice = s["voice"]
                if "tts_engine" in s:
                    session.tts_engine = s["tts_engine"]
                if "language" in s:
                    session.language = s["language"]
                if "denoise" in s:
                    session.denoise = bool(s["denoise"])
                if "enhance" in s:
                    session.enhance = bool(s["enhance"])
                # Reset pipeline on config change
                session._pipeline = None
                session._state = None
                await _send(
                    websocket,
                    {
                        "type": "session.updated",
                        "session": {
                            "id": session.session_id,
                            "object": "session",
                            "model": "voice-changer-v1",
                            "voice": session.voice,
                            "modalities": ["audio"],
                        },
                    },
                )

            elif msg_type == "input_audio_buffer.append":
                audio_b64 = msg.get("audio", "")
                if audio_b64:
                    try:
                        raw_bytes = base64.b64decode(audio_b64)
                        samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32767.0
                        session.audio_buffer.extend(samples.tolist())
                    except Exception as exc:
                        logger.debug("Audio decode error: %s", exc)

            elif msg_type == "input_audio_buffer.commit":
                if session.audio_buffer and not session.is_processing:
                    session._process_task = asyncio.create_task(_process_committed(websocket, session))

            elif msg_type == "input_audio_buffer.clear":
                session.audio_buffer.clear()

            elif msg_type == "response.cancel":
                session.audio_buffer.clear()
                session.is_processing = False
                if session._process_task and not session._process_task.done():
                    session._process_task.cancel()

            elif msg_type == "ping":
                await _send(
                    websocket,
                    {
                        "type": "pong",
                        "event_id": msg.get("event_id", ""),
                    },
                )

    except WebSocketDisconnect:
        logger.debug("Voice changer client disconnected: %s", session.session_id)
    except Exception as exc:
        logger.debug("Voice changer WebSocket error: %s", exc, exc_info=True)
    finally:
        _stop_keepalive.set()
        keepalive_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await keepalive_task
        if session._process_task and not session._process_task.done():
            session._process_task.cancel()
        # Flush any remaining audio
        if session.audio_buffer and session._pipeline:
            pipeline, state = session.get_pipeline()
            try:
                output, _ = pipeline.force_flush(state)
                if output:
                    logger.debug("Flushed %d leftover samples", len(output))
            except Exception:
                pass
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close()
