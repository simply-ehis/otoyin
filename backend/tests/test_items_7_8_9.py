"""Tests for items 7-9: MCP routing, structured output, fallback chain."""

import json

from backend.agents.manifest import get_mcp_instructions
from backend.routes.assistant_tools.formatter import (
    TOOL_FALLBACKS,
    build_structured_result,
    sse_event,
    suggest_fallback,
)


class TestMCPRouting:
    """Item 7: context-aware MCP instructions."""

    def test_default_instructions_mention_key_tools(self):
        """Default instructions should mention speak, transcribe, list_skills."""
        instructions = get_mcp_instructions()
        assert "speak" in instructions.lower()
        assert "transcribe" in instructions.lower()
        assert "list_skills" in instructions.lower()

    def test_generation_query_returns_generation_hint(self):
        """Query about speech should return generation-specific hint."""
        instructions = get_mcp_instructions("generate speech for me")
        assert "speak" in instructions.lower()

    def test_transcription_query_returns_transcription_hint(self):
        """Query about transcription should return transcription hint."""
        instructions = get_mcp_instructions("transcribe this audio")
        assert "transcribe" in instructions.lower()

    def test_export_query_returns_export_hint(self):
        """Query about export should return export hint."""
        instructions = get_mcp_instructions("export to mp3")
        assert "export" in instructions.lower()

    def test_editing_query_returns_editing_hint(self):
        """Query about effects should return editing hint."""
        instructions = get_mcp_instructions("add reverb to the track")
        assert "effects" in instructions.lower() or "reverb" in instructions.lower()

    def test_no_query_returns_full_hint(self):
        """No query should return the full discoverability hint."""
        instructions = get_mcp_instructions(None)
        assert "list_skills" in instructions.lower()

    def test_empty_query_returns_full_hint(self):
        """Empty query should return the full discoverability hint."""
        instructions = get_mcp_instructions("")
        assert "list_skills" in instructions.lower()


class TestStructuredOutput:
    """Item 8: structured result for agent consumption."""

    def test_success_result(self):
        """Successful tool call should produce structured success."""
        result = build_structured_result(
            "generate_speech",
            '{"audio_file": "out.wav"}',
        )
        assert result["status"] == "success"
        assert result["tool"] == "generate_speech"
        assert result["result"] == {"audio_file": "out.wav"}

    def test_error_result(self):
        """Failed tool call should produce structured error."""
        result = build_structured_result(
            "generate_speech",
            "Error 500: engine not found",
        )
        assert result["status"] == "error"
        assert result["tool"] == "generate_speech"
        assert "error" in result

    def test_non_json_result(self):
        """Non-JSON result should be stored as-is."""
        result = build_structured_result(
            "list_voices",
            "Found 5 voice profiles",
        )
        assert result["status"] == "success"
        assert result["result"] == "Found 5 voice profiles"

    def test_includes_args(self):
        """Args should be included when provided."""
        result = build_structured_result(
            "speak",
            '{"audio_file": "out.wav"}',
            args={"text": "hello", "profile": "default"},
        )
        assert result["args"] == {"text": "hello", "profile": "default"}

    def test_includes_fallback(self):
        """Fallback suggestion should be included when provided."""
        result = build_structured_result(
            "generate_speech",
            "Error: engine not found",
            fallback="Try 21labs.speak with a different engine",
        )
        assert result["fallback"] == "Try 21labs.speak with a different engine"

    def test_sse_event_includes_structured(self):
        """SSE event should include the structured field."""
        event = sse_event(
            "tool_result",
            "OK",
            tool_name="speak",
            structured={"status": "success"},
        )
        assert '"structured"' in event
        parsed = json.loads(event.removeprefix("data: ").strip())
        assert parsed["structured"]["status"] == "success"


class TestFallbackChain:
    """Item 9: tool-to-tool fallback suggestions."""

    def test_generate_speech_fallback_to_speak(self):
        """generate_speech should suggest speak as fallback."""
        fb = suggest_fallback("generate_speech", "engine not found")
        assert fb is not None
        assert "speak" in fb.lower()

    def test_speak_fallback_to_generate_speech(self):
        """speak should suggest generate_speech as fallback."""
        fb = suggest_fallback("speak", "some error")
        assert fb is not None
        assert "generate_speech" in fb.lower()

    def test_master_track_fallback(self):
        """master_track should suggest normalize_audio."""
        fb = suggest_fallback("master_track", "loudness failed")
        assert fb is not None
        assert "normalize" in fb.lower()

    def test_unknown_tool_no_fallback(self):
        """Unknown tool should return no fallback."""
        fb = suggest_fallback("totally_bogus", "error")
        assert fb is None

    def test_fallback_map_covers_key_tools(self):
        """Fallback map should cover the key generation/editing tools."""
        assert "generate_speech" in TOOL_FALLBACKS
        assert "speak" in TOOL_FALLBACKS
        assert "master_track" in TOOL_FALLBACKS
        assert "transcribe" in TOOL_FALLBACKS
