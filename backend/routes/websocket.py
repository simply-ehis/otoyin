"""WebSocket connection info endpoint for external app integration.

External applications on the same machine can connect to otoyin's WebSocket
endpoints for speech-to-speech and realtime voice processing. This endpoint
returns the WebSocket URLs and protocol information so external clients can
discover how to connect without hardcoding ports.

Endpoints documented here:
  - GET /voice-chat/ws  — Full speech-to-speech pipeline (STT → LLM → TTS)
  - GET /realtime/ws    — OpenAI Realtime-compatible voice processing
  - ws://localhost:17494/voice-changer/ws  — Standalone voice changer (port 17494)

All endpoints accept connections from http://localhost:* origins (external
apps on the same machine). Connections without an Origin header are also
allowed. Backend binds to 127.0.0.1 by default — not exposed to the internet
unless --remote mode is explicitly enabled.
"""

import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from .. import config

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Models ──────────────────────────────────────────────────────────────────


class WebSocketEndpoint(BaseModel):
    """A single WebSocket endpoint description."""

    path: str
    url_template: str  # e.g. "ws://{host}:{port}/voice-chat/ws"
    protocol: str  # e.g. "speech-to-speech" | "openai-realtime"
    description: str
    origin_policy: str  # e.g. "localhost-only" | "any-origin"
    messages_in: list[str]  # message types the client sends
    messages_out: list[str]  # message types the server sends


class WebSocketInfoResponse(BaseModel):
    """Response model for GET /websocket/info."""

    backend_host: str  # e.g. "127.0.0.1"
    backend_port: int  # e.g. 17493
    voice_changer_port: int | None  # e.g. 17494 or None if not spawned
    endpoints: list[WebSocketEndpoint]
    connection_notes: list[str]


# ── Endpoint ────────────────────────────────────────────────────────────────


@router.get("/websocket/info", response_model=WebSocketInfoResponse)
async def websocket_info():
    """Return WebSocket endpoint information for external app integration.

    External applications on the same machine can use this to discover how to
    connect to otoyin's WebSocket endpoints for speech-to-speech, realtime
    voice processing, and voice changing.

    Returns the backend host/port, voice changer port (if spawned), endpoint
    descriptions, message schemas, and connection policies.
    """
    # Resolve the runtime port from the port handoff file written by
    # backend.main on startup, falling back to the default.
    backend_port = 17493
    backend_host = "127.0.0.1"
    try:
        runtime_dir = config.get_data_dir() / "runtime"
        port_file = runtime_dir / "backend_port.json"
        if port_file.is_file():
            data = json.loads(port_file.read_text(encoding="utf-8"))
            backend_port = int(data.get("port", 17493))
    except Exception:
        logger.debug("Could not read backend port handoff file; using default", exc_info=True)

    # Try to detect the voice changer port
    voice_changer_port = None
    try:
        from backend.voice_changer import get_voice_changer_port

        vc_port = get_voice_changer_port()
        if vc_port is not None:
            voice_changer_port = vc_port
    except Exception:
        logger.debug("Voice changer port unavailable", exc_info=True)

    endpoints = [
        WebSocketEndpoint(
            path="/voice-chat/ws",
            url_template=f"ws://{backend_host}:{backend_port}/voice-chat/ws",
            protocol="speech-to-speech",
            description=(
                "Full speech-to-speech pipeline: microphone audio → VAD → STT → "
                "LLM → TTS → synthesized audio. Send 'audio' binary/text messages, "
                "receive 'partial_transcript', 'response', 'audio_delta' events."
            ),
            origin_policy="localhost-only (http://localhost:* allowed, no-Origin allowed)",
            messages_in=[
                "start",
                "audio",
                "end",
                "cancel",
                "confirm_tool",
                "deny_tool",
            ],
            messages_out=[
                "started",
                "processing",
                "silence",
                "speech_started",
                "speech_ended",
                "partial_transcript",
                "response",
                "audio_delta",
                "audio_done",
                "ended",
                "error",
            ],
        ),
        WebSocketEndpoint(
            path="/realtime/ws",
            url_template=f"ws://{backend_host}:{backend_port}/realtime/ws",
            protocol="openai-realtime",
            description=(
                "OpenAI Realtime-compatible WebSocket for third-party clients. "
                "Send session.update, input_audio_buffer.append, "
                "input_audio_buffer.commit, response.cancel, ping. Receive "
                "session.created, session.updated, response.created, "
                "response.audio.delta, response.audio.done, response.done, "
                "conversation.item.created, pong, error."
            ),
            origin_policy="localhost-only (http://localhost:* allowed, no-Origin allowed)",
            messages_in=[
                "session.update",
                "input_audio_buffer.append",
                "input_audio_buffer.commit",
                "input_audio_buffer.clear",
                "response.cancel",
                "ping",
            ],
            messages_out=[
                "session.created",
                "session.updated",
                "response.created",
                "response.audio.delta",
                "response.audio.done",
                "response.done",
                "conversation.item.created",
                "pong",
                "error",
            ],
        ),
    ]

    if voice_changer_port is not None:
        endpoints.append(
            WebSocketEndpoint(
                path="/voice-changer/ws",
                url_template=f"ws://{backend_host}:{voice_changer_port}/voice-changer/ws",
                protocol="openai-realtime",
                description=(
                    "Standalone voice-changer service (headless subprocess). "
                    "Real-time voice conversion: mic → VAD → DeepFilterNet → "
                    "Whisper → kokoro TTS → LavaSR → out. Same OpenAI "
                    "Realtime-compatible protocol as /realtime/ws."
                ),
                origin_policy="localhost-only (http://localhost:* allowed, no-Origin allowed)",
                messages_in=[
                    "session.update",
                    "input_audio_buffer.append",
                    "input_audio_buffer.commit",
                    "input_audio_buffer.clear",
                    "response.cancel",
                    "ping",
                ],
                messages_out=[
                    "session.created",
                    "session.updated",
                    "response.created",
                    "response.audio.delta",
                    "response.audio.done",
                    "response.done",
                    "conversation.item.created",
                    "pong",
                    "error",
                ],
            ),
        )

    connection_notes = [
        f"Backend binds to {backend_host}:{backend_port} by default.",
        "WebSocket origins are restricted to localhost-only: "
        "http://localhost:* origins are allowed; connections without an "
        "Origin header are also allowed. Non-localhost origins are rejected.",
        "External apps on the same machine can connect via "
        f"ws://{backend_host}:{backend_port}/voice-chat/ws or "
        f"ws://{backend_host}:{backend_port}/realtime/ws.",
        "If the voice changer is spawned (voice_changer_enabled setting), "
        "it listens on port 17494 (or next free port if busy).",
        "The port handoff file at {data_dir}/runtime/backend_port.json "
        "carries the bound port for Tauri-side discovery.",
        "No cloud dependencies — everything runs offline/on-device.",
    ]
    connection_notes[-1] = connection_notes[-1].format(data_dir=config.get_data_dir())

    return WebSocketInfoResponse(
        backend_host=backend_host,
        backend_port=backend_port,
        voice_changer_port=voice_changer_port,
        endpoints=endpoints,
        connection_notes=connection_notes,
    )
