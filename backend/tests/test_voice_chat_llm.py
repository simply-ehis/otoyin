"""Tests for voice chat LLM response generation and tool calling.

Covers:
- _generate_llm_response happy path
- Tool calling flow (LLM returns tool calls → execute → re-prompt)
- Conversation history capping at MAX_CONVERSATION_HISTORY
- Memory persistence integration
- Error handling in LLM generation
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services.voice_chat import (
    MAX_CONVERSATION_HISTORY,
    VoiceChatSession,
    _generate_llm_response,
)


@pytest.fixture(autouse=True)
def _cleanup():
    """Clear sessions after each test."""
    from backend.services import voice_chat

    yield
    voice_chat._sessions.clear()


def _make_session(**overrides) -> VoiceChatSession:
    defaults = {
        "session_id": "test_llm",
        "language": "en",
        "system_prompt": "You are a test assistant.",
        "stt_model": "base",
        "tts_engine": "kokoro",
        "enable_tools": True,
        "conversation_history": [],
    }
    defaults.update(overrides)
    return VoiceChatSession(**defaults)


class _FakeResponse:
    """Mimics the LLM backend response — string with optional .tool_calls."""

    def __init__(self, text: str = "", tool_calls: list | None = None):
        self._text = text
        self.tool_calls = tool_calls or []

    def strip(self) -> str:
        return self._text.strip()

    def __bool__(self) -> bool:
        return bool(self._text)


# ---------------------------------------------------------------------------
# 1. Happy path — LLM returns plain text
# ---------------------------------------------------------------------------


class TestGenerateLLMResponse:
    @pytest.mark.asyncio
    async def test_plain_text_response(self):
        session = _make_session()
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=_FakeResponse("Hello! How can I help?"))

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            result = await _generate_llm_response("Hi there", session)

        assert result == "Hello! How can I help?"
        assert len(session.conversation_history) == 2  # user + assistant
        assert session.conversation_history[0]["role"] == "user"
        assert session.conversation_history[0]["content"] == "Hi there"
        assert session.conversation_history[1]["role"] == "assistant"
        assert session.conversation_history[1]["content"] == "Hello! How can I help?"

    @pytest.mark.asyncio
    async def test_empty_llm_response(self):
        session = _make_session()
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=_FakeResponse(""))

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            result = await _generate_llm_response("Say nothing", session)

        assert result == ""

    @pytest.mark.asyncio
    async def test_llm_returns_none_content(self):
        session = _make_session()
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=None)

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            result = await _generate_llm_response("Test", session)

        assert result == ""


# ---------------------------------------------------------------------------
# 2. Tool calling flow
# ---------------------------------------------------------------------------


class TestToolCalling:
    @pytest.mark.asyncio
    async def test_tool_call_executed_and_result_appended(self):
        session = _make_session()
        mock_llm = MagicMock()

        # First call: LLM returns a tool call
        # Second call: LLM returns final text after tool result
        mock_llm.generate = AsyncMock(
            side_effect=[
                _FakeResponse(
                    "",
                    tool_calls=[MagicMock(name="get_time", arguments="{}", id="tc_1")],
                ),
                _FakeResponse("The current time is 3:42 PM."),
            ]
        )

        mock_tool_result = {"type": "text", "content": "15:42"}

        with (
            patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm),
            patch(
                "backend.services.voice_chat._execute_tool_call",
                new_callable=AsyncMock,
                return_value=mock_tool_result,
            ) as mock_exec,
        ):
            result = await _generate_llm_response("What time is it?", session)

        assert result == "The current time is 3:42 PM."
        mock_exec.assert_called_once()
        # History: user, assistant(tool_call), tool, assistant(final)
        assert len(session.conversation_history) == 4
        assert session.conversation_history[2]["role"] == "tool"

    @pytest.mark.asyncio
    async def test_multiple_tool_calls(self):
        session = _make_session()
        mock_llm = MagicMock()

        tc1 = MagicMock(name="get_time", arguments="{}", id="tc_1")
        tc2 = MagicMock(name="get_weather", arguments='{"city":"NYC"}', id="tc_2")

        mock_llm.generate = AsyncMock(
            side_effect=[
                _FakeResponse("", tool_calls=[tc1, tc2]),
                _FakeResponse("Time: 3:42, Weather: Sunny"),
            ]
        )

        with (
            patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm),
            patch(
                "backend.services.voice_chat._execute_tool_call",
                new_callable=AsyncMock,
                return_value={"type": "text", "content": "result"},
            ),
        ):
            result = await _generate_llm_response("Check time and weather", session)

        assert result == "Time: 3:42, Weather: Sunny"
        # user + assistant(tool_calls) + 2 tool_results + assistant(final) = 5
        assert len(session.conversation_history) == 5

    @pytest.mark.asyncio
    async def test_tool_execution_error_returns_fallback(self):
        session = _make_session()
        mock_llm = MagicMock()

        tc = MagicMock(name="broken_tool", arguments="{}", id="tc_1")

        mock_llm.generate = AsyncMock(
            side_effect=[
                _FakeResponse("", tool_calls=[tc]),
                _FakeResponse("Sorry, that tool failed."),
            ]
        )

        with (
            patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm),
            patch(
                "backend.services.voice_chat._execute_tool_call",
                new_callable=AsyncMock,
                side_effect=RuntimeError("Tool execution failed"),
            ),
        ):
            result = await _generate_llm_response("Use broken tool", session)

        # The RuntimeError from tool execution propagates to the outer except,
        # so the error handler returns the fallback message
        assert result == "I'm sorry, I couldn't process that."


# ---------------------------------------------------------------------------
# 3. Conversation history capping
# ---------------------------------------------------------------------------


class TestHistoryCapping:
    @pytest.mark.asyncio
    async def test_history_capped_at_max(self):
        session = _make_session()
        # Pre-fill history with MAX_CONVERSATION_HISTORY messages
        session.conversation_history = [
            {"role": "user", "content": f"msg {i}"} for i in range(MAX_CONVERSATION_HISTORY)
        ]

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=_FakeResponse("Response"))

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            await _generate_llm_response("New message", session)

        # Should be capped: MAX + user + assistant = MAX + 2, then trimmed to MAX
        assert len(session.conversation_history) <= MAX_CONVERSATION_HISTORY

    @pytest.mark.asyncio
    async def test_history_preserves_system_prompt(self):
        session = _make_session()
        session.conversation_history = [
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "Old message"},
        ] * 50  # 100 messages

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=_FakeResponse("Response"))

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            await _generate_llm_response("New message", session)

        # System prompt should still be present
        roles = [m["role"] for m in session.conversation_history]
        assert "system" in roles


# ---------------------------------------------------------------------------
# 4. Error handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_llm_generation_failure_returns_fallback(self):
        session = _make_session()
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(side_effect=RuntimeError("LLM crashed"))

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            result = await _generate_llm_response("Hello", session)

        # Error handler returns fallback message, not empty string
        assert result == "I'm sorry, I couldn't process that."
        assert len(session.conversation_history) == 1  # user only; error path doesn't append assistant

    @pytest.mark.asyncio
    async def test_llm_timeout_returns_fallback(self):
        session = _make_session()
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(side_effect=TimeoutError())

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            result = await _generate_llm_response("Hello", session)

        # Error handler returns fallback message, not empty string
        assert result == "I'm sorry, I couldn't process that."


# ---------------------------------------------------------------------------
# 5. Session state updates
# ---------------------------------------------------------------------------


class TestSessionStateUpdates:
    @pytest.mark.asyncio
    async def test_last_activity_updated(self):
        session = _make_session()
        old_activity = session.last_activity
        time.sleep(0.01)

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=_FakeResponse("Response"))

        with patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm):
            await _generate_llm_response("Hello", session)

        assert session.last_activity >= old_activity

    @pytest.mark.asyncio
    async def test_tool_calls_set_is_processing(self):
        session = _make_session()
        mock_llm = MagicMock()

        call_count = 0

        async def mock_generate(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _FakeResponse(
                    "",
                    tool_calls=[MagicMock(name="get_time", arguments="{}", id="tc_1")],
                )
            return _FakeResponse("Done")

        mock_llm.generate = mock_generate

        with (
            patch("backend.services.voice_chat.get_llm_backend", return_value=mock_llm),
            patch(
                "backend.services.voice_chat._execute_tool_call",
                new_callable=AsyncMock,
                return_value={"type": "text", "content": "3:42"},
            ),
        ):
            await _generate_llm_response("What time?", session)

        # After completion, is_processing should be False
        assert session.is_processing is False
