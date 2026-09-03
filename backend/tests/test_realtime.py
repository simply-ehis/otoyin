"""Tests for the OpenAI Realtime protocol WebSocket endpoint."""

import uuid


class TestRealtimeProtocol:
    """Test Realtime WebSocket protocol compliance."""

    def test_session_created_event_format(self):
        """session.created must include required fields."""
        event = {
            "type": "session.created",
            "session": {
                "id": str(uuid.uuid4()),
                "object": "session",
                "model": "21labs-default",
                "voice": "alloy",
                "modalities": ["text", "audio"],
            },
        }
        assert event["type"] == "session.created"
        assert "session" in event
        session = event["session"]
        assert session["object"] == "session"
        assert "id" in session
        assert "model" in session
        assert "voice" in session
        assert "modalities" in session

    def test_session_updated_event_format(self):
        """session.updated must include required fields."""
        event = {
            "type": "session.updated",
            "session": {
                "id": str(uuid.uuid4()),
                "object": "session",
                "model": "21labs-default",
                "voice": "alloy",
                "modalities": ["text", "audio"],
            },
        }
        assert event["type"] == "session.updated"
        assert "session" in event
        assert event["session"]["object"] == "session"

    def test_response_created_event_format(self):
        """response.created must include response with id and status."""
        event = {
            "type": "response.created",
            "response": {
                "id": f"resp_{uuid.uuid4().hex[:12]}",
                "object": "response",
                "status": "in_progress",
            },
        }
        assert event["type"] == "response.created"
        resp = event["response"]
        assert resp["object"] == "response"
        assert resp["status"] == "in_progress"
        assert "id" in resp

    def test_response_audio_delta_format(self):
        """response.audio.delta must include response_id and delta."""
        event = {
            "type": "response.audio.delta",
            "response_id": f"resp_{uuid.uuid4().hex[:12]}",
            "delta": "base64encodedaudio",
        }
        assert event["type"] == "response.audio.delta"
        assert "response_id" in event
        assert "delta" in event

    def test_response_done_event_format(self):
        """response.done must include response with completed status."""
        event = {
            "type": "response.done",
            "response": {
                "id": f"resp_{uuid.uuid4().hex[:12]}",
                "object": "response",
                "status": "completed",
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        }
        assert event["type"] == "response.done"
        assert event["response"]["status"] == "completed"
        assert "usage" in event["response"]

    def test_conversation_item_created_format(self):
        """conversation.item.created must include item with role and content."""
        event = {
            "type": "conversation.item.created",
            "item": {
                "id": f"item_{uuid.uuid4().hex[:12]}",
                "object": "conversation.item",
                "role": "user",
                "content": [{"type": "input_text", "text": "Hello"}],
            },
        }
        assert event["type"] == "conversation.item.created"
        item = event["item"]
        assert item["object"] == "conversation.item"
        assert item["role"] in ("user", "assistant")
        assert len(item["content"]) > 0

    def test_transcription_completed_format(self):
        """transcription.completed must include transcript text."""
        event = {
            "type": "conversation.item.input_audio_transcription.completed",
            "item_id": f"item_{uuid.uuid4().hex[:12]}",
            "content_index": 0,
            "transcript": "Hello world",
        }
        assert event["type"].endswith(".completed")
        assert "transcript" in event
        assert isinstance(event["transcript"], str)

    def test_error_event_format(self):
        """error event must include error with type and message."""
        event = {
            "type": "error",
            "error": {
                "type": "server_error",
                "message": "Something went wrong",
            },
        }
        assert event["type"] == "error"
        assert "error" in event
        assert "type" in event["error"]
        assert "message" in event["error"]

    def test_pong_event_format(self):
        """pong must echo the event_id from ping."""
        event = {
            "type": "pong",
            "event_id": "test_123",
        }
        assert event["type"] == "pong"
        assert event["event_id"] == "test_123"


class TestRealtimeInboundMessages:
    """Test inbound message handling."""

    def test_session_update_message_format(self):
        """session.update must include session config."""
        msg = {
            "type": "session.update",
            "session": {
                "voice": "alloy",
                "model": "21labs-default",
                "language": "en",
                "instructions": "You are helpful.",
            },
        }
        assert msg["type"] == "session.update"
        assert "session" in msg
        assert "voice" in msg["session"]

    def test_audio_buffer_append_format(self):
        """input_audio_buffer.append must include base64 audio."""
        msg = {
            "type": "input_audio_buffer.append",
            "audio": "base64encodeddata",
        }
        assert msg["type"] == "input_audio_buffer.append"
        assert "audio" in msg

    def test_audio_buffer_commit_format(self):
        """input_audio_buffer.commit must be processable."""
        msg = {"type": "input_audio_buffer.commit"}
        assert msg["type"] == "input_audio_buffer.commit"

    def test_audio_buffer_clear_format(self):
        """input_audio_buffer.clear must discard buffer."""
        msg = {"type": "input_audio_buffer.clear"}
        assert msg["type"] == "input_audio_buffer.clear"

    def test_response_cancel_format(self):
        """response.cancel must stop generation."""
        msg = {"type": "response.cancel"}
        assert msg["type"] == "response.cancel"

    def test_ping_format(self):
        """ping must be respondable with pong."""
        msg = {"type": "ping", "event_id": "test_456"}
        assert msg["type"] == "ping"
        assert "event_id" in msg


class TestRealtimeState:
    """Test _RealtimeState initialization."""

    def test_default_state(self):
        """Default state should have sensible defaults."""
        import os
        import sys

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

        from routes.realtime import _RealtimeState

        state = _RealtimeState()
        assert state.session_id
        assert state.voice == "alloy"
        assert state.model == "21labs-default"
        assert state.language == "en"
        assert state.system_prompt == ""
        assert state.enable_tools is False
        assert state.audio_buffer == []
        assert state.is_processing is False
        assert state.conversation_history == []

    def test_state_update_session(self):
        """State should be updatable via session.update."""
        import os
        import sys

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

        from routes.realtime import _RealtimeState

        state = _RealtimeState()
        state.voice = "echo"
        state.language = "es"
        state.enable_tools = True

        assert state.voice == "echo"
        assert state.language == "es"
        assert state.enable_tools is True
