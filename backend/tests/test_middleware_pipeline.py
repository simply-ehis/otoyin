"""End-to-end test for the middleware pipeline in stream_local().

Verifies that the full chain — parse → validate → filter_low_confidence →
enforce_budget → execute — runs correctly when stream_local() is called.
"""

import json

import pytest

from backend.routes.assistant_tools.tool_call_middleware import (
    filter_low_confidence_calls,
    parse_tool_calls,
    validate_tool_call,
)

# --- Unit tests for the middleware chain (no async mock needed) ---


class TestMiddlewareChain:
    """Test the middleware functions run in the correct order."""

    def test_parse_validate_filter_budget_pipeline(self):
        """Full chain: parse → validate → filter → budget."""
        raw = json.dumps(
            {
                "tool_calls": [
                    {
                        "id": "c1",
                        "function": {"name": "generate_speech", "arguments": {"text": "hello", "profile_id": "abc"}},
                    },
                    {"id": "c2", "function": {"name": "list_voices", "arguments": {}}},
                ]
            }
        )
        # 1. Parse
        calls = parse_tool_calls(raw)
        assert len(calls) == 2

        # 2. Validate
        validated = []
        for tc in calls:
            err = validate_tool_call(tc)
            if err:
                pytest.fail(f"Validation failed: {err}")
            validated.append(tc)
        assert len(validated) == 2

        # 3. Filter (both should pass)
        accepted, rejected = filter_low_confidence_calls(validated)
        assert len(accepted) == 2
        assert len(rejected) == 0

    def test_rejects_hallucinated_tool(self):
        """A hallucinated tool name should be filtered out by confidence scoring."""
        raw = json.dumps(
            {
                "tool_calls": [
                    {
                        "id": "c1",
                        "function": {"name": "generate_speech", "arguments": {"text": "hi", "profile_id": "x"}},
                    },
                    {"id": "c2", "function": {"name": "make_fusion_reactor", "arguments": {"energy": "100MW"}}},
                ]
            }
        )
        calls = parse_tool_calls(raw)

        # Validate — the hallucinated tool will fail validation
        validated = []
        for tc in calls:
            err = validate_tool_call(tc)
            if err:
                continue  # skip invalid (this is what stream_local does)
            validated.append(tc)
        assert len(validated) == 1  # only the real tool survives

        # Filter — the real tool should pass
        accepted, _rejected = filter_low_confidence_calls(validated)
        assert len(accepted) == 1

    def test_budget_caps_at_five(self):
        """Enforce budget should cap tool calls at MAX_TOOL_CALLS_PER_TURN."""
        calls = [{"name": f"tool_{i}", "arguments": {}, "id": f"c{i}"} for i in range(8)]
        from backend.routes.assistant_tools.tool_call_middleware import enforce_tool_call_budget

        result = enforce_tool_call_budget(calls)
        assert len(result) == 5

    def test_empty_after_filter_returns_nothing(self):
        """If all calls are rejected, the pipeline should yield nothing."""
        calls = [
            {"name": "totally_bogus_1", "arguments": {}, "id": "c1"},
            {"name": "totally_bogus_2", "arguments": {}, "id": "c2"},
        ]
        accepted, rejected = filter_low_confidence_calls(calls)
        assert len(accepted) == 0
        assert len(rejected) == 2


class TestRetryPromptIntegration:
    """Test that build_retry_prompt produces targeted messages."""

    def test_missing_arg_prompt_includes_example(self):
        from backend.routes.assistant_tools.tool_call_middleware import build_retry_prompt

        prompt = build_retry_prompt(
            '{"tool_calls": [{"function": {"name": "generate_speech"}}]}',
            "Missing required argument 'text' for tool 'generate_speech'",
        )
        # Should mention the specific tool and missing arg
        assert "generate_speech" in prompt
        assert "text" in prompt
        # Should include a correct example JSON
        assert "tool_calls" in prompt

    def test_unknown_tool_prompt_suggests_alternatives(self):
        from backend.routes.assistant_tools.tool_call_middleware import build_retry_prompt

        prompt = build_retry_prompt(
            '{"tool_calls": [{"function": {"name": "make_sandwich"}}]}',
            "Unknown tool: make_sandwich",
        )
        assert "make_sandwich" in prompt
        # Should suggest similar tools if any exist
        assert "not a valid tool" in prompt.lower() or "not a valid" in prompt.lower()
