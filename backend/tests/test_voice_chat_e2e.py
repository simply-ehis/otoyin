"""End-to-end integration tests for voice chat WebSocket.

Tests the full WebSocket protocol lifecycle. All backends are mocked.
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest


class MockWebSocket:
    """Mock WebSocket for testing."""

    def __init__(self):
        self.sent: list[str] = []
        self._receive_queue: asyncio.Queue[str] = asyncio.Queue()
        self.accepted = False
        self.client_state = "CONNECTED"
        self.headers = {"origin": "http://localhost"}  # Required by voice_chat route origin validation

    async def accept(self):
        self.accepted = True

    async def send_json(self, data: dict):
        # Yield like a real socket write so background tasks (the processing
        # task) actually get loop ticks while the queue is flooded.
        await asyncio.sleep(0)
        self.sent.append(json.dumps(data))

    async def send_text(self, data: str):
        await asyncio.sleep(0)
        self.sent.append(data)

    async def receive_text(self) -> str:
        if self._receive_queue.empty():
            # Behave like a real socket on close: Starlette raises
            # WebSocketDisconnect, which the route handles as a clean
            # disconnect. A generic Exception here would (correctly)
            # surface as "Internal server error" and poison every test
            # that drains the queue mid-processing.
            from starlette.websockets import WebSocketDisconnect

            raise WebSocketDisconnect()
        # Yield like a real socket read for the same reason as send_json.
        await asyncio.sleep(0)
        return await self._receive_queue.get()

    async def close(self):
        self.client_state = "DISCONNECTED"

    def enqueue(self, data: dict):
        self._receive_queue.put_nowait(json.dumps(data))

    def get_messages(self) -> list[dict]:
        return [json.loads(m) for m in self.sent]

    def get_message_types(self) -> list[str]:
        return [m.get("type") for m in self.get_messages()]

    def get_messages_by_type(self, msg_type: str) -> list[dict]:
        return [m for m in self.get_messages() if m.get("type") == msg_type]


@pytest.fixture
def ws():
    return MockWebSocket()


@pytest.fixture(autouse=True)
def _force_cached_tts():
    """Voice sessions require a cached TTS engine (manifest-gate contract); pin
    the resolved engine so the WS ``start`` path is deterministic in the suite."""
    with patch("backend.utils.model_status.pick_cached_tts_engine", return_value="kokoro"):
        yield


@pytest.fixture(autouse=True)
def _force_energy_vad():
    """Force VAD to use energy fallback so test audio patterns work."""
    from backend.services.vad import SileroVAD

    original_init = SileroVAD.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        self._session = None
        self._model_load_failed = True

    with patch.object(SileroVAD, "__init__", patched_init):
        yield


MOCK_RESPONSE = {
    "type": "response",
    "text": "What time is it?",
    "response": "It's 3:45 PM.",
}


class TestVoiceChatE2E:
    """End-to-end voice chat flow tests."""

    @pytest.mark.asyncio
    async def test_full_session_lifecycle(self, ws):
        with patch(
            "backend.routes.voice_chat.process_audio_chunk",
            new_callable=AsyncMock,
            return_value=MOCK_RESPONSE,
        ):
            from backend.routes.voice_chat import voice_chat_websocket

            ws.enqueue({"type": "start", "language": "en"})
            ws.enqueue({"type": "end"})

            await voice_chat_websocket(ws)

            types = ws.get_message_types()
            assert "started" in types
            assert "ended" in types
            assert ws.accepted

    @pytest.mark.asyncio
    async def test_start_returns_session_id(self, ws):
        from backend.routes.voice_chat import voice_chat_websocket

        ws.enqueue({"type": "start", "language": "en"})
        ws.enqueue({"type": "end"})

        await voice_chat_websocket(ws)

        started = ws.get_messages_by_type("started")
        assert len(started) == 1
        assert "session_id" in started[0]
        assert len(started[0]["session_id"]) > 0

    @pytest.mark.asyncio
    async def test_error_without_session(self, ws):
        from backend.routes.voice_chat import voice_chat_websocket

        ws.enqueue({"type": "audio", "audio": [0.1] * 1600})
        ws.enqueue({"type": "end"})

        await voice_chat_websocket(ws)

        errors = ws.get_messages_by_type("error")
        assert len(errors) > 0
        assert "No active session" in errors[0]["message"]

    @pytest.mark.asyncio
    async def test_speech_detection_events(self, ws):
        with patch(
            "backend.routes.voice_chat.process_audio_chunk",
            new_callable=AsyncMock,
            return_value=MOCK_RESPONSE,
        ):
            from backend.routes.voice_chat import voice_chat_websocket

            ws.enqueue({"type": "start", "language": "en"})

            for _ in range(15):
                ws.enqueue({"type": "audio", "audio": [0.5] * 512})
            for _ in range(20):
                ws.enqueue({"type": "audio", "audio": [0.0] * 512})

            ws.enqueue({"type": "end"})

            await voice_chat_websocket(ws)

            types = ws.get_message_types()
            assert "speech_started" in types
            assert "speech_ended" in types

    @pytest.mark.asyncio
    async def test_processing_and_response(self, ws):
        with patch(
            "backend.routes.voice_chat.process_audio_chunk",
            new_callable=AsyncMock,
            return_value=MOCK_RESPONSE,
        ):
            from backend.routes.voice_chat import voice_chat_websocket

            ws.enqueue({"type": "start", "language": "en"})

            for _ in range(15):
                ws.enqueue({"type": "audio", "audio": [0.5] * 512})
            for _ in range(20):
                ws.enqueue({"type": "audio", "audio": [0.0] * 512})

            ws.enqueue({"type": "end"})

            await voice_chat_websocket(ws)

            messages = ws.get_messages()
            types = ws.get_message_types()
            assert "processing" in types
            assert "response" in types

            resp = next(m for m in messages if m["type"] == "response")
            assert resp["text"] == "What time is it?"
            assert resp["response"] == "It's 3:45 PM."

    @pytest.mark.asyncio
    async def test_cancel_without_playback_task(self, ws):
        from backend.routes.voice_chat import voice_chat_websocket

        ws.enqueue({"type": "start", "language": "en"})
        ws.enqueue({"type": "cancel"})
        ws.enqueue({"type": "end"})

        await voice_chat_websocket(ws)

        types = ws.get_message_types()
        assert "ended" in types
        assert "cancelled" not in types

    @pytest.mark.asyncio
    async def test_end_terminates_connection(self, ws):
        from backend.routes.voice_chat import voice_chat_websocket

        ws.enqueue({"type": "start", "language": "en"})
        ws.enqueue({"type": "end"})
        # Messages after "end" are not processed (connection closes)
        ws.enqueue({"type": "start", "language": "es"})

        await voice_chat_websocket(ws)

        types = ws.get_message_types()
        assert types.count("started") == 1
        assert types.count("ended") == 1


class TestRealtimeE2E:
    """End-to-end Realtime protocol tests."""

    @pytest.mark.asyncio
    async def test_session_created_on_connect(self, ws):
        from backend.routes.realtime import realtime_ws

        ws.enqueue({"type": "ping", "event_id": "p1"})
        await realtime_ws(ws)

        types = ws.get_message_types()
        assert "session.created" in types
        assert "pong" in types

    @pytest.mark.asyncio
    async def test_session_update(self, ws):
        from backend.routes.realtime import realtime_ws

        ws.enqueue(
            {
                "type": "session.update",
                "session": {"voice": "echo", "instructions": "Be helpful."},
            }
        )
        ws.enqueue({"type": "ping", "event_id": "p2"})
        await realtime_ws(ws)

        messages = ws.get_messages()
        types = ws.get_message_types()
        assert "session.updated" in types

        updated = next(m for m in messages if m["type"] == "session.updated")
        assert updated["session"]["voice"] == "echo"
        assert updated["session"]["instructions"] == "Be helpful."

    @pytest.mark.asyncio
    async def test_clear_and_cancel(self, ws):
        from backend.routes.realtime import realtime_ws

        ws.enqueue({"type": "input_audio_buffer.clear"})
        ws.enqueue({"type": "response.cancel"})
        ws.enqueue({"type": "ping", "event_id": "p3"})
        await realtime_ws(ws)

        types = ws.get_message_types()
        assert "session.created" in types
        assert "pong" in types

    @pytest.mark.asyncio
    async def test_commit_without_audio(self, ws):
        from backend.routes.realtime import realtime_ws

        ws.enqueue({"type": "input_audio_buffer.commit"})
        ws.enqueue({"type": "ping", "event_id": "p4"})
        await realtime_ws(ws)

        types = ws.get_message_types()
        assert "session.created" in types
        assert "pong" in types
        assert "response.created" not in types
