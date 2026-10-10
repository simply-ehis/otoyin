"""Tests for the voice chat service."""

from unittest.mock import patch

import pytest

from backend.services.voice_chat import (
    VoiceChatSession,
    _compute_energy,
    _get_voice_chat_tools,
    create_session,
    end_session,
    get_session,
    list_sessions,
    process_audio_chunk,
)


@pytest.fixture(autouse=True)
def _cached_tts_session():
    """create_session requires a cached TTS engine (manifest-gate contract) and
    otherwise depends on ambient on-disk cache + call-order, which makes the
    full suite flaky. Pin the resolved engine so sessions start deterministically."""
    with patch("backend.utils.model_status.pick_cached_tts_engine", return_value="kokoro"):
        yield


class TestComputeEnergy:
    """Test the energy computation helper."""

    def test_silence(self):

        audio = [0.0] * 1000
        energy = _compute_energy(audio)
        assert energy == pytest.approx(0.0, abs=1e-6)

    def test_loud_audio(self):
        import numpy as np

        audio = np.sin(np.linspace(0, 2 * np.pi * 440, 1000)).tolist()
        energy = _compute_energy(audio)
        assert energy > 0.5

    def test_empty_audio(self):
        energy = _compute_energy([])
        assert energy == 0.0


class TestSessionManagement:
    """Test session creation, retrieval, and cleanup."""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        """Clean up sessions after each test."""
        yield
        from backend.services.voice_chat import _sessions

        _sessions.clear()

    async def test_create_session(self):
        session = await create_session(language="en", stt_model="base")
        assert session.session_id is not None
        assert len(session.session_id) == 12
        assert session.language == "en"
        assert session.stt_model == "base"

    async def test_create_session_with_custom_prompt(self):
        session = await create_session(system_prompt="Custom prompt")
        assert session.system_prompt == "Custom prompt"

    async def test_get_session(self):
        session = await create_session()
        retrieved = get_session(session.session_id)
        assert retrieved is session

    async def test_get_nonexistent_session(self):
        assert get_session("nonexistent") is None

    async def test_end_session(self):
        session = await create_session()
        await end_session(session.session_id)
        assert get_session(session.session_id) is None

    async def test_list_sessions(self):
        await create_session()
        await create_session()
        sessions = list_sessions()
        assert len(sessions) == 2
        assert all("session_id" in s for s in sessions)


class TestVoiceChatTools:
    """Test tool definitions for voice chat."""

    def test_tools_list_not_empty(self):
        tools = _get_voice_chat_tools()
        assert len(tools) > 0

    def test_all_tools_have_function_type(self):
        tools = _get_voice_chat_tools()
        for tool in tools:
            assert tool["type"] == "function"
            assert "function" in tool
            assert "name" in tool["function"]
            assert "description" in tool["function"]
            assert "parameters" in tool["function"]


class TestVoiceChatSession:
    """Test the session dataclass."""

    def test_default_values(self):
        session = VoiceChatSession(session_id="test123")
        assert session.language == "en"
        assert session.is_processing is False
        assert session.is_playing_audio is False
        assert session.enable_tools is True
        assert session.conversation_history == []
        # Bounded deque (30s cap) — assert emptiness, not container type.
        assert len(session.audio_buffer) == 0

    def test_custom_values(self):
        session = VoiceChatSession(
            session_id="test123",
            language="fr",
            enable_tools=False,
            tts_engine="kokoro",
        )
        assert session.language == "fr"
        assert session.enable_tools is False
        assert session.tts_engine == "kokoro"


class TestProcessAudioChunk:
    """Test the audio chunk processing pipeline."""

    @pytest.fixture(autouse=True)
    def _cleanup(self):
        yield
        from backend.services.voice_chat import _sessions

        _sessions.clear()

    async def test_no_session_returns_error(self):
        result = await process_audio_chunk("nonexistent", [0.0] * 100)
        assert result["type"] == "error"
        assert "not found" in result["message"].lower()

    @patch("backend.services.voice_chat.get_stt_backend")
    @patch("backend.services.voice_chat.get_llm_backend")
    @patch("backend.services.voice_chat.get_tts_backend")
    async def test_silence_returns_silence(self, mock_tts, mock_llm, mock_stt):
        session = await create_session()
        # Send silence (low energy)
        result = await process_audio_chunk(session.session_id, [0.0] * 100)
        assert result["type"] == "silence"

    @patch("backend.services.voice_chat.get_stt_backend")
    @patch("backend.services.voice_chat.get_llm_backend")
    @patch("backend.services.voice_chat.get_tts_backend")
    async def test_barge_in_cancels_playback(self, mock_tts, mock_llm, mock_stt):
        import asyncio

        session = await create_session()
        session.is_playing_audio = True
        session.playback_task = asyncio.create_task(asyncio.sleep(10))

        # Send loud audio to trigger barge-in
        import numpy as np

        loud = (np.sin(np.linspace(0, 2 * np.pi * 440, 512)) * 0.8).tolist()
        # Send enough frames to trigger speech detection
        for _ in range(20):
            await process_audio_chunk(session.session_id, loud)

        assert session.is_playing_audio is False

        # Cleanup
        session.playback_task = None


class TestToolConfirmation:
    """Test the tool confirmation flow."""

    def test_session_has_confirmation_fields(self):
        session = VoiceChatSession(session_id="test-123")
        assert session.tool_confirmation_future is None
        assert session.tool_confirmation_info is None

    @pytest.mark.asyncio
    async def test_resolve_tool_confirmation_sets_result(self):
        import asyncio

        from backend.services.voice_chat import resolve_tool_confirmation

        session = VoiceChatSession(session_id="test-resolve")
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        session.tool_confirmation_future = future

        resolve_tool_confirmation(session, True)
        assert future.done()
        assert future.result() is True

    @pytest.mark.asyncio
    async def test_resolve_tool_confirmation_false(self):
        import asyncio

        from backend.services.voice_chat import resolve_tool_confirmation

        session = VoiceChatSession(session_id="test-deny")
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        session.tool_confirmation_future = future

        resolve_tool_confirmation(session, False)
        assert future.done()
        assert future.result() is False

    @pytest.mark.asyncio
    async def test_resolve_noop_when_no_future(self):
        from backend.services.voice_chat import resolve_tool_confirmation

        session = VoiceChatSession(session_id="test-noop")
        # Should not raise
        resolve_tool_confirmation(session, True)

    @pytest.mark.asyncio
    async def test_request_tool_confirmation_timeout(self, monkeypatch):
        """An unanswered prompt must deny (fail-closed) without waiting 30s."""
        from backend.services import voice_chat as vc

        monkeypatch.setattr(vc, "TOOL_CONFIRMATION_TIMEOUT_S", 0.05)
        session = VoiceChatSession(session_id="test-timeout")
        result = await vc._request_tool_confirmation(
            session,
            "test_tool",
            {},
            "test reason",
        )
        assert result is False  # Timed out, default is False
        # Cleanup must still run on the timeout path.
        assert session.tool_confirmation_future is None
        assert session.tool_confirmation_info is None

    @pytest.mark.asyncio
    async def test_request_tool_confirmation_resolves(self):
        import asyncio

        from backend.services.voice_chat import _request_tool_confirmation, resolve_tool_confirmation

        session = VoiceChatSession(session_id="test-confirm-resolve")

        async def confirm_after_delay():
            await asyncio.sleep(0.05)
            resolve_tool_confirmation(session, True)

        confirm_task = asyncio.create_task(confirm_after_delay())
        result = await _request_tool_confirmation(
            session,
            "test_tool",
            {"arg": "val"},
            "test reason",
        )
        await confirm_task
        assert result is True
        assert session.tool_confirmation_future is None  # Cleaned up
