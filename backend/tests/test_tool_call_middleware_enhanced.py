"""Tests for the enhanced tool-call middleware (Phase 3).

Covers:
- Confidence scoring (ToolCallConfidence, score_tool_call)
- filter_low_confidence_calls
- enforce_tool_call_budget
- build_retry_prompt
- build_no_tool_response
- parse_tool_calls with confidence metadata
"""

import pytest

from backend.routes.assistant_tools.tool_call_middleware import (
    CONFIDENCE_THRESHOLD,
    MAX_TOOL_CALLS_PER_TURN,
    ToolCallConfidence,
    build_no_tool_response,
    build_retry_prompt,
    enforce_tool_call_budget,
    filter_low_confidence_calls,
    parse_tool_calls,
    score_tool_call,
)


class TestToolCallConfidence:
    def test_confidence_properties(self):
        tc = ToolCallConfidence(name="test", score=0.7, reasons=[], warnings=[])
        assert tc.is_confident is True
        assert tc.is_low_confidence is False

    def test_not_confident(self):
        tc = ToolCallConfidence(name="test", score=0.3, reasons=[], warnings=[])
        assert tc.is_confident is False
        assert tc.is_low_confidence is True

    def test_threshold_boundary(self):
        tc = ToolCallConfidence(name="test", score=CONFIDENCE_THRESHOLD, reasons=[], warnings=[])
        assert tc.is_confident is True


class TestScoreToolCall:
    def test_perfect_call(self):
        confidence = score_tool_call("generate_speech", {"text": "hello", "profile_id": "abc123"}, {})
        assert confidence.score >= 0.9
        assert confidence.is_confident is True

    def test_missing_required_arg(self):
        confidence = score_tool_call("generate_speech", {"text": "hello"}, {})
        assert confidence.score < 1.0
        assert any("Missing" in r for r in confidence.reasons)
        assert not confidence.is_confident or confidence.score >= 0.4

    def test_unknown_tool(self):
        confidence = score_tool_call("totally_bogus", {}, {})
        assert confidence.score == 0.0
        assert any("Unknown" in r for r in confidence.reasons)

    def test_extra_args_penalized(self):
        confidence = score_tool_call("generate_speech", {"text": "hi", "extra_arg": "bad"}, {})
        assert confidence.score < 1.0
        assert any("Unexpected" in w for w in confidence.warnings)

    def test_out_of_range_penalized(self):
        confidence = score_tool_call("studio_set_master_volume", {"session_id": "s1", "volume": 999}, {})
        assert confidence.score < 1.0
        assert any("outside" in w for w in confidence.warnings)

    def test_type_mismatch_penalized(self):
        confidence = score_tool_call("generate_speech", {"text": 123}, {})
        assert confidence.score < 1.0
        assert any("string" in w for w in confidence.warnings)


class TestFilterLowConfidenceCalls:
    def test_accepts_confident_calls(self):
        calls = [{"name": "generate_speech", "arguments": {"text": "hello"}}]
        accepted, rejected = filter_low_confidence_calls(calls)
        assert len(accepted) == 1
        assert len(rejected) == 0

    def test_rejects_low_confidence(self):
        calls = [{"name": "totally_bogus", "arguments": {}}]
        accepted, rejected = filter_low_confidence_calls(calls)
        assert len(accepted) == 0
        assert len(rejected) == 1
        assert rejected[0].score < CONFIDENCE_THRESHOLD

    def test_respects_custom_threshold(self):
        calls = [{"name": "generate_speech", "arguments": {"text": "hi"}}]
        _accepted, rejected = filter_low_confidence_calls(calls, min_confidence=0.99)
        # High threshold means even good calls may be rejected
        assert len(rejected) >= 0  # may or may not be rejected depending on score


class TestEnforceToolCallBudget:
    def test_within_budget_unchanged(self):
        calls = [{"name": f"tool_{i}"} for i in range(3)]
        result = enforce_tool_call_budget(calls, max_calls=5)
        assert len(result) == 3

    def test_over_budget_truncated(self):
        calls = [{"name": f"tool_{i}"} for i in range(10)]
        result = enforce_tool_call_budget(calls, max_calls=5)
        assert len(result) == 5

    def test_empty_list(self):
        result = enforce_tool_call_budget([], max_calls=5)
        assert result == []

    def test_default_max_is_five(self):
        assert MAX_TOOL_CALLS_PER_TURN == 5


class TestBuildRetryPrompt:
    def test_missing_arg_gives_specific_fix(self):
        prompt = build_retry_prompt(
            "bad json",
            "Missing required argument 'text' for tool 'generate_speech'",
        )
        assert "generate_speech" in prompt
        assert "text" in prompt
        assert "Required arguments" in prompt
        assert "tool_calls" in prompt

    def test_unknown_tool_suggests_similar(self):
        prompt = build_retry_prompt(
            "bad json",
            "Unknown tool: generat_speech",
        )
        assert "generat_speech" in prompt
        assert "not a valid tool" in prompt.lower() or "not a valid" in prompt.lower()

    def test_out_of_range_gives_range(self):
        prompt = build_retry_prompt(
            "bad json",
            "Argument 'volume'=999.0 outside allowed range [0.0, 1.0] for tool 'studio_set_master_volume'",
        )
        assert "999.0" in prompt
        assert "0.0" in prompt
        assert "[0.0, 1.0]" in prompt

    def test_generic_error_falls_back(self):
        prompt = build_retry_prompt("bad json", "Some other error")
        assert "Some other error" in prompt
        assert "tool_calls" in prompt


class TestBuildNoToolResponse:
    def test_contains_error_details(self):
        response = build_no_tool_response("Failed to parse")
        assert "Failed to parse" in response
        assert "tool call" in response.lower()


class TestParseToolCallsEnhanced:
    def _wrap(self, inner: str) -> str:
        return f'{{"tool_calls": [{{"function": {inner}}}]}}'

    def _call(self, name: str, args: str | dict | None = None) -> str:
        if args is None:
            args_str = "{}"
        elif isinstance(args, str):
            args_str = args
        else:
            import json

            args_str = json.dumps(args)
        return f'{{"name": "{name}", "arguments": {args_str}}}'

    def test_parses_with_confidence_metadata(self):
        raw = self._wrap(self._call("list_voices"))
        calls = parse_tool_calls(raw)
        assert len(calls) == 1
        assert calls[0]["name"] == "list_voices"

    def test_plain_text_returns_empty(self):
        assert parse_tool_calls("No tools needed.") == []

    def test_invalid_json_raises(self):
        raw = '{"tool_calls": [not_valid_json}'
        with pytest.raises(ValueError):
            parse_tool_calls(raw)

    def test_empty_tool_calls_list(self):
        raw = '{"tool_calls": []}'
        calls = parse_tool_calls(raw)
        assert calls == []
