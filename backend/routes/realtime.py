"""OpenAI Realtime API-compatible WebSocket endpoint for 21labs.

Implements the core OpenAI Realtime protocol so third-party clients
that speak this protocol can connect to otoyin as a backend.

Protocol summary:
  1. Client sends session.update to configure voice, tools, etc.
  2. Client sends input_audio_buffer.append with base64 audio chunks.
  3. Client sends input_audio_buffer.commit to finalize audio input.
  4. Server streams response.audio.delta events with base64 audio.
  5. Server sends response.audio.done when generation is complete.
  6. Server sends conversation.item.created with transcript/response text.
"""

import asyncio
import base64
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

router = APIRouter()


class _RealtimeState:
    """Per-connection state for a Realtime session."""

    def __init__(self) -> None:
        self.session_id: str = str(uuid.uuid4())
        self.voice: str = "alloy"
        self.model: str = "21labs-default"
        self.language: str = "en"
        self.system_prompt: str = ""
        self.stt_model: str = "base"
        self.tts_engine: str = "kokoro"
        self.enable_tools: bool = False
        self.audio_buffer: list[float] = []
        self.is_processing: bool = False
        self.conversation_history: list[dict] = []
        self._process_task: asyncio.Task | None = None


async def _send_event(ws: WebSocket, event: dict) -> None:
    """Send a JSON event to the client."""
    await ws.send_text(json.dumps(event))


async def _send_session_created(ws: WebSocket, state: _RealtimeState) -> None:
    """Send session.created event after connection."""
    await _send_event(
        ws,
        {
            "type": "session.created",
            "session": {
                "id": state.session_id,
                "object": "session",
                "model": state.model,
                "voice": state.voice,
                "modalities": ["text", "audio"],
                "instructions": state.system_prompt,
                "temperature": 0.7,
                "tool_choice": "auto",
            },
        },
    )


async def _send_session_updated(ws: WebSocket, state: _RealtimeState) -> None:
    """Send session.updated event after configuration."""
    await _send_event(
        ws,
        {
            "type": "session.updated",
            "session": {
                "id": state.session_id,
                "object": "session",
                "model": state.model,
                "voice": state.voice,
                "modalities": ["text", "audio"],
                "instructions": state.system_prompt,
                "temperature": 0.7,
                "tool_choice": "auto",
            },
        },
    )


async def _process_audio(
    ws: WebSocket,
    state: _RealtimeState,
) -> None:
    """Process committed audio through the voice chat pipeline."""
    if state.is_processing:
        return

    state.is_processing = True

    try:
        from ..services.voice_chat import VoiceChatSession

        session = VoiceChatSession(
            language=state.language,
            system_prompt=state.system_prompt or None,
            stt_model=state.stt_model,
            tts_engine=state.tts_engine,
            enable_tools=state.enable_tools,
        )

        audio_data = list(state.audio_buffer)
        state.audio_buffer.clear()

        if not audio_data:
            state.is_processing = False
            return

        # Send response.created
        response_id = f"resp_{uuid.uuid4().hex[:12]}"
        await _send_event(
            ws,
            {
                "type": "response.created",
                "response": {
                    "id": response_id,
                    "object": "response",
                    "status": "in_progress",
                },
            },
        )

        # Send response.audio.delta (streamed audio)
        await _send_event(
            ws,
            {
                "type": "response.audio.delta",
                "response_id": response_id,
                "delta": "",
            },
        )

        # Get text response and TTS audio
        transcript_result = await session.transcribe(audio_data)
        if not transcript_result:
            await _send_event(
                ws,
                {
                    "type": "response.audio.done",
                    "response_id": response_id,
                },
            )
            await _send_event(
                ws,
                {
                    "type": "response.done",
                    "response": {
                        "id": response_id,
                        "object": "response",
                        "status": "completed",
                    },
                },
            )
            state.is_processing = False
            return

        text = transcript_result.get("text", "")
        if not text:
            await _send_event(
                ws,
                {
                    "type": "response.audio.done",
                    "response_id": response_id,
                },
            )
            await _send_event(
                ws,
                {
                    "type": "response.done",
                    "response": {
                        "id": response_id,
                        "object": "response",
                        "status": "completed",
                    },
                },
            )
            state.is_processing = False
            return

        # Send transcription completed event
        await _send_event(
            ws,
            {
                "type": "conversation.item.input_audio_transcription.completed",
                "item_id": f"item_{uuid.uuid4().hex[:12]}",
                "content_index": 0,
                "transcript": text,
            },
        )

        # Create conversation item
        item_id = f"item_{uuid.uuid4().hex[:12]}"
        await _send_event(
            ws,
            {
                "type": "conversation.item.created",
                "item": {
                    "id": item_id,
                    "object": "conversation.item",
                    "role": "user",
                    "content": [{"type": "input_audio_transcript", "transcript": text}],
                },
            },
        )

        # Get LLM response (with tool calling support)
        from ..services.voice_chat import VoiceChatSession, _generate_llm_response

        vc_session = VoiceChatSession(
            session_id=state.session_id,
            language=state.language,
            system_prompt=state.system_prompt,
            stt_model=state.stt_model,
            tts_engine=state.tts_engine,
            enable_tools=state.enable_tools,
        )
        vc_session.conversation_history = state.conversation_history
        response_text = await _generate_llm_response(text, vc_session)
        state.conversation_history = vc_session.conversation_history

        if response_text:
            # Create assistant item
            assistant_item_id = f"item_{uuid.uuid4().hex[:12]}"
            await _send_event(
                ws,
                {
                    "type": "conversation.item.created",
                    "item": {
                        "id": assistant_item_id,
                        "object": "conversation.item",
                        "role": "assistant",
                        "content": [{"type": "text", "text": response_text}],
                    },
                },
            )

            # Stream TTS audio
            audio_chunks: list[str] = []
            async for chunk in session.synthesize_streaming(response_text):
                if chunk:
                    audio_chunks.append(chunk)
                    await _send_event(
                        ws,
                        {
                            "type": "response.audio.delta",
                            "response_id": response_id,
                            "delta": chunk,
                        },
                    )

            # Send audio done
            await _send_event(
                ws,
                {
                    "type": "response.audio.done",
                    "response_id": response_id,
                },
            )

        # Send response done
        await _send_event(
            ws,
            {
                "type": "response.done",
                "response": {
                    "id": response_id,
                    "object": "response",
                    "status": "completed",
                    "usage": {
                        "input_tokens": 0,
                        "output_tokens": 0,
                    },
                },
            },
        )

    except Exception as e:
        logger.debug("Realtime processing error: %s", e, exc_info=True)
        await _send_event(
            ws,
            {
                "type": "error",
                "error": {
                    "type": "server_error",
                    "message": "Internal server error",
                },
            },
        )
    finally:
        state.is_processing = False


@router.websocket("/realtime/ws")
async def realtime_ws(websocket: WebSocket) -> None:
    """OpenAI Realtime-compatible WebSocket endpoint.

    Handles the session lifecycle:
    - session.update: configure voice, model, tools
    - input_audio_buffer.append: stream audio chunks
    - input_audio_buffer.commit: finalize audio and get response
    - input_audio_buffer.clear: discard buffered audio
    - response.cancel: cancel current generation
    """
    from ..services.rate_limiter import get_realtime_limiter

    limiter = get_realtime_limiter()

    # Check session limit
    allowed, reason = await limiter.can_open_session(websocket)
    if not allowed:
        await websocket.accept()
        await _send_event(
            websocket,
            {
                "type": "error",
                "error": {"type": "rate_limit_exceeded", "message": reason},
            },
        )
        await websocket.close()
        return

    await websocket.accept()
    await limiter.register_session(websocket)
    state = _RealtimeState()

    # Send session.created
    await _send_session_created(websocket, state)

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type == "session.update":
                session = msg.get("session", {})
                if "voice" in session:
                    state.voice = session["voice"]
                if "model" in session:
                    state.model = session["model"]
                if "language" in session:
                    state.language = session["language"]
                if "instructions" in session:
                    state.system_prompt = session["instructions"]
                if "stt_model" in session:
                    state.stt_model = session["stt_model"]
                if "tts_engine" in session:
                    state.tts_engine = session["tts_engine"]
                if "enable_tools" in session:
                    state.enable_tools = session["enable_tools"]
                await _send_session_updated(websocket, state)

            elif msg_type == "input_audio_buffer.append":
                audio_b64 = msg.get("audio", "")
                if audio_b64:
                    try:
                        raw_bytes = base64.b64decode(audio_b64)
                        samples = list(__import__("array").array("h", raw_bytes))
                        state.audio_buffer.extend(samples)
                    except Exception as e:
                        logger.debug("Audio decode error: %s", e)

            elif msg_type == "input_audio_buffer.commit":
                if state.audio_buffer and not state.is_processing:
                    state._process_task = asyncio.create_task(_process_audio(websocket, state))

            elif msg_type == "input_audio_buffer.clear":
                state.audio_buffer.clear()

            elif msg_type == "response.cancel":
                state.audio_buffer.clear()
                state.is_processing = False

            elif msg_type == "ping":
                await _send_event(
                    websocket,
                    {
                        "type": "pong",
                        "event_id": msg.get("event_id", ""),
                    },
                )

    except WebSocketDisconnect:
        logger.debug("Realtime client disconnected: %s", state.session_id)
    except Exception as e:
        logger.debug("Realtime WebSocket error: %s", e, exc_info=True)
    finally:
        if state._process_task and not state._process_task.done():
            state._process_task.cancel()
        await limiter.unregister_session(websocket)
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close()
