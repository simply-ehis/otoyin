"""Tests for the enhanced small-model harness capabilities.

Covers:
- Session memory (tool stats, recent calls, avoided tools)
- Context pressure monitoring
- Adaptive steering (hints, avoided tools prompt)
- Failure loop detection
- Smart response compaction
- create_harness_session with n_ctx-derived budget
"""

import json

import pytest

from backend.routes.assistant_tools.harness import (
    _FAILURE_STEER_THRESHOLD,
    _LOOP_DETECTION_WINDOW,
    ExecutionRecord,
    ExecutionStatus,
    HarnessState,
    compact_tool_response,
    create_harness_session,
    detect_failure_loop,
    estimate_messages_tokens,
    estimate_tokens,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def session() -> HarnessState:
    return create_harness_session(n_ctx=8192)


def _make_record(
    tool_name: str,
    status: ExecutionStatus = ExecutionStatus.COMPLETED,
    result: str = "ok",
    duration_ms: float = 100.0,
    arguments: dict | None = None,
) -> ExecutionRecord:
    return ExecutionRecord(
        timestamp="2025-01-01T00:00:00Z",
        tool_name=tool_name,
        arguments=arguments or {},
        status=status,
        result=result,
        duration_ms=duration_ms,
    )


# ---------------------------------------------------------------------------
# Session creation
# ---------------------------------------------------------------------------


class TestCreateSession:
    def test_default_budget(self):
        s = create_harness_session()
        assert s.budget_remaining == 100

    def test_n_ctx_derives_budget(self):
        s = create_harness_session(n_ctx=4096)
        assert s.budget_remaining == 8  # 4096 // 500 = 8

    def test_explicit_budget_wins(self):
        s = create_harness_session(budget=50, n_ctx=4096)
        assert s.budget_remaining == 50

    def test_n_ctx_stored(self):
        s = create_harness_session(n_ctx=16384)
        assert s.n_ctx == 16384


# ---------------------------------------------------------------------------
# Session memory: tool stats
# ---------------------------------------------------------------------------


class TestToolStats:
    def test_success_counted(self, session: HarnessState):
        session.record_execution(_make_record("speak", ExecutionStatus.COMPLETED))
        assert session.tool_success_counts["speak"] == 1
        assert session.successful_calls == 1

    def test_failure_counted(self, session: HarnessState):
        session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="error"))
        assert session.tool_failure_counts["speak"] == 1
        assert session.failed_calls == 1

    def test_multiple_calls_accumulated(self, session: HarnessState):
        for _ in range(3):
            session.record_execution(_make_record("speak", ExecutionStatus.COMPLETED))
        for _ in range(2):
            session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="err"))
        assert session.tool_success_counts["speak"] == 3
        assert session.tool_failure_counts["speak"] == 2

    def test_recent_tool_calls_tracked(self, session: HarnessState):
        for name in ["a", "b", "c", "d"]:
            session.record_execution(_make_record(name))
        names = [c[0] for c in session.recent_tool_calls]
        assert names == ["a", "b", "c", "d"]

    def test_recent_tool_calls_capped(self, session: HarnessState):
        for i in range(15):
            session.record_execution(_make_record(f"tool_{i}"))
        assert len(session.recent_tool_calls) == 10
        assert session.recent_tool_calls[-1][0] == "tool_14"


# ---------------------------------------------------------------------------
# Adaptive steering
# ---------------------------------------------------------------------------


class TestAdaptiveSteering:
    def test_no_hints_initially(self, session: HarnessState):
        assert session.steering_hints == []
        assert session.avoided_tools == set()

    def test_tool_marked_avoided_after_failures(self, session: HarnessState):
        for _ in range(_FAILURE_STEER_THRESHOLD):
            session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="err"))
        assert "speak" in session.avoided_tools

    def test_steering_hint_generated(self, session: HarnessState):
        for _ in range(_FAILURE_STEER_THRESHOLD):
            session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="err"))
        assert any("speak" in h for h in session.steering_hints)

    def test_get_steering_prompt(self, session: HarnessState):
        for _ in range(_FAILURE_STEER_THRESHOLD):
            session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="err"))
        prompt = session.get_steering_prompt()
        assert "Session Guidance" in prompt
        assert "speak" in prompt

    def test_get_steering_prompt_empty_when_clean(self, session: HarnessState):
        assert session.get_steering_prompt() == ""

    def test_get_avoided_tools_prompt(self, session: HarnessState):
        for _ in range(_FAILURE_STEER_THRESHOLD):
            session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="err"))
        prompt = session.get_avoided_tools_prompt()
        assert "speak" in prompt

    def test_get_avoided_tools_prompt_empty_when_clean(self, session: HarnessState):
        assert session.get_avoided_tools_prompt() == ""

    def test_hints_capped_at_max(self, session: HarnessState):
        # Fail many different tools to generate many hints
        for i in range(10):
            tool = f"tool_{i}"
            for _ in range(_FAILURE_STEER_THRESHOLD):
                session.record_execution(_make_record(tool, ExecutionStatus.FAILED, result="err"))
        assert len(session.steering_hints) <= 5


# ---------------------------------------------------------------------------
# Context pressure
# ---------------------------------------------------------------------------


class TestContextPressure:
    def test_pressure_zero_initially(self, session: HarnessState):
        assert session.context_pressure == 0.0

    def test_pressure_updated(self, session: HarnessState):
        session.update_context_pressure(estimated_tokens=4096, n_ctx=8192)
        assert session.context_pressure == pytest.approx(0.5)

    def test_pressure_clamped_to_one(self, session: HarnessState):
        session.update_context_pressure(estimated_tokens=20000, n_ctx=8192)
        assert session.context_pressure == 1.0

    def test_is_context_warned(self, session: HarnessState):
        session.update_context_pressure(estimated_tokens=6144, n_ctx=8192)  # 75%
        assert session.is_context_warned is True

    def test_is_context_critical(self, session: HarnessState):
        session.update_context_pressure(estimated_tokens=7373, n_ctx=8192)  # ~90%
        assert session.is_context_critical is True

    def test_pressure_generates_hint(self, session: HarnessState):
        session.update_context_pressure(estimated_tokens=7373, n_ctx=8192)  # critical
        prompt = session.get_steering_prompt()
        assert "Context is nearly full" in prompt

    def test_pressure_warning_hint(self, session: HarnessState):
        session.update_context_pressure(estimated_tokens=6144, n_ctx=8192)  # warn
        prompt = session.get_steering_prompt()
        assert "Context is getting full" in prompt


# ---------------------------------------------------------------------------
# Loop detection
# ---------------------------------------------------------------------------


class TestLoopDetection:
    def test_no_loop_short_list(self):
        assert detect_failure_loop([("a", "{}"), ("b", "{}")]) is None

    def test_no_loop_diverse(self):
        assert detect_failure_loop([("a", "{}"), ("b", "{}"), ("c", "{}")]) is None

    def test_exact_loop_detected(self):
        calls = [("a", '{"x": 1}'), ("a", '{"x": 1}'), ("a", '{"x": 1}')]
        result = detect_failure_loop(calls)
        assert result is not None
        assert result["type"] == "exact"
        assert result["tool"] == "a"

    def test_exact_loop_detected_longer(self):
        calls = [
            ("a", "{}"),
            ("b", "{}"),
            ("a", "{}"),
            ("a", "{}"),
            ("a", "{}"),
        ]
        result = detect_failure_loop(calls)
        assert result is not None
        assert result["type"] == "exact"
        assert result["tool"] == "a"

    def test_degenerate_loop(self):
        """Same tool with all-empty args should be degenerate."""
        calls = [("a", "{}"), ("a", "{}"), ("a", "{}")]
        result = detect_failure_loop(calls)
        assert result is not None
        assert result["type"] in ("exact", "degenerate")

    def test_near_loop_detected(self):
        """Same tool with very similar (but not identical) args."""
        from backend.routes.assistant_tools.harness import _fingerprint_args

        calls = [
            ("speak", _fingerprint_args({"text": "hello", "speed": 1.0})),
            ("speak", _fingerprint_args({"text": "hello", "speed": 1.0001})),
            ("speak", _fingerprint_args({"text": "hello", "speed": 1.0002})),
        ]
        result = detect_failure_loop(calls)
        assert result is not None
        assert result["type"] in ("near", "exact")
        assert result["tool"] == "speak"

    def test_oscillation_detected(self):
        """Alternating A-B-A-B pattern should be detected."""
        calls = [
            ("speak", '{"text": "a"}'),
            ("compress", '{"threshold": -20}'),
            ("speak", '{"text": "a"}'),
            ("compress", '{"threshold": -20}'),
        ]
        result = detect_failure_loop(calls)
        assert result is not None
        assert result["type"] == "oscillation"
        assert set(result["tools"]) == {"speak", "compress"}

    def test_no_loop_with_varied_args(self):
        """Same tool but truly different args should not loop."""
        calls = [
            ("speak", '{"text": "hello"}'),
            ("speak", '{"text": "goodbye"}'),
            ("speak", '{"text": "testing"}'),
        ]
        result = detect_failure_loop(calls)
        assert result is None

    def test_loop_generates_hint(self, session: HarnessState):
        for _ in range(_LOOP_DETECTION_WINDOW):
            session.record_execution(_make_record("speak", ExecutionStatus.COMPLETED))
        prompt = session.get_steering_prompt()
        assert "loop detected" in prompt.lower() or "repeating" in prompt.lower()


# ---------------------------------------------------------------------------
# Confidence decay
# ---------------------------------------------------------------------------


class TestConfidenceDecay:
    def test_initial_confidence(self, session: HarnessState):
        """New tool should have default confidence."""
        assert session.get_tool_confidence("nonexistent") == 1.0

    def test_failure_decays_confidence(self, session: HarnessState):
        session.record_execution(_make_record("compress_audio", ExecutionStatus.FAILED))
        conf = session.get_tool_confidence("compress_audio")
        assert conf < 1.0
        assert conf == 0.75  # 1.0 - 0.25

    def test_multiple_failures_decay_more(self, session: HarnessState):
        for _ in range(3):
            session.record_execution(_make_record("compress_audio", ExecutionStatus.FAILED))
        conf = session.get_tool_confidence("compress_audio")
        assert conf == 0.25  # 1.0 - 3*0.25

    def test_success_boosts_confidence(self, session: HarnessState):
        # Decay first
        session.record_execution(_make_record("compress_audio", ExecutionStatus.FAILED))
        session.record_execution(_make_record("compress_audio", ExecutionStatus.FAILED))
        assert session.get_tool_confidence("compress_audio") == 0.50
        # Then boost
        session.record_execution(_make_record("compress_audio", ExecutionStatus.COMPLETED))
        assert session.get_tool_confidence("compress_audio") == 0.60

    def test_confidence_cannot_exceed_one(self, session: HarnessState):
        for _ in range(20):
            session.record_execution(_make_record("speak", ExecutionStatus.COMPLETED))
        assert session.get_tool_confidence("speak") == 1.0

    def test_confidence_floor(self, session: HarnessState):
        for _ in range(20):
            session.record_execution(_make_record("broken_tool", ExecutionStatus.FAILED))
        assert session.get_tool_confidence("broken_tool") == 0.05

    def test_low_confidence_generates_hint(self, session: HarnessState):
        for _ in range(4):
            session.record_execution(_make_record("bad_tool", ExecutionStatus.FAILED))
        prompt = session.get_steering_prompt()
        assert "low-confidence" in prompt.lower() or "bad_tool" in prompt

    def test_confidence_in_to_dict(self, session: HarnessState):
        session.record_execution(_make_record("speak", ExecutionStatus.FAILED))
        d = session.to_dict()
        assert "tool_confidence" in d
        assert "speak" in d["tool_confidence"]

    def test_get_all_confidence(self, session: HarnessState):
        session.record_execution(_make_record("speak", ExecutionStatus.COMPLETED))
        session.record_execution(_make_record("compress", ExecutionStatus.FAILED))
        all_conf = session.get_all_confidence()
        assert "speak" in all_conf
        assert "compress" in all_conf
        assert all_conf["speak"] > all_conf["compress"]


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


class TestTokenEstimation:
    def test_basic_estimate(self):
        assert estimate_tokens("hello world") == 2  # 11 chars / 4 = 2

    def test_empty_string(self):
        assert estimate_tokens("") >= 1

    def test_messages_tokens(self):
        msgs = [{"role": "user", "content": "hello world"}]
        assert estimate_messages_tokens(msgs) > 0

    def test_tool_calls_counted(self):
        msgs = [{"role": "assistant", "content": "x", "tool_calls": [{"name": "speak"}]}]
        assert estimate_messages_tokens(msgs) > 1


# ---------------------------------------------------------------------------
# Response compaction
# ---------------------------------------------------------------------------


class TestResponseCompaction:
    def test_short_response_unchanged(self):
        result, was_compacted = compact_tool_response("speak", "short text", max_tokens=500)
        assert result == "short text"
        assert was_compacted is False

    def test_empty_response_unchanged(self):
        result, was_compacted = compact_tool_response("speak", "", max_tokens=500)
        assert result == ""
        assert was_compacted is False

    def test_error_response_unchanged(self):
        error = "Error: connection failed"
        result, was_compacted = compact_tool_response("speak", error, max_tokens=500)
        assert result == error
        assert was_compacted is False

    def test_json_audio_response_compacted(self):
        response = json.dumps(
            {
                "audio_file": "/path/to/output.wav",
                "duration": 5.0,
                "sample_rate": 44100,
                "format": "wav",
                "size_bytes": 882044,
                "extra_metadata": "x" * 1000,
            }
        )
        result, was_compacted = compact_tool_response("generate_speech", response, max_tokens=100)
        assert was_compacted is True
        data = json.loads(result)
        assert "audio_file" in data
        assert "extra_metadata" not in data

    def test_json_list_response_compacted(self):
        items = [{"id": str(i), "name": f"item_{i}", "extra": "x" * 100} for i in range(20)]
        response = json.dumps({"profiles": items})
        result, was_compacted = compact_tool_response("list_profiles", response, max_tokens=200)
        assert was_compacted is True
        data = json.loads(result)
        assert len(data["profiles"]) == 10
        assert data.get("profiles_count") == 20

    def test_long_text_truncated(self):
        long_text = "x" * 5000
        result, was_compacted = compact_tool_response("unknown_tool", long_text, max_tokens=100)
        assert was_compacted is True
        assert len(result) < len(long_text)
        assert "truncated" in result.lower()


# ---------------------------------------------------------------------------
# Audit trail with new fields
# ---------------------------------------------------------------------------


class TestAuditTrail:
    def test_audit_trail_includes_pressure(self, session: HarnessState):
        from backend.routes.assistant_tools.harness import format_audit_trail

        session.update_context_pressure(4096, 8192)
        trail = format_audit_trail(session)
        assert "Context pressure" in trail

    def test_audit_trail_includes_avoided(self, session: HarnessState):
        from backend.routes.assistant_tools.harness import format_audit_trail

        for _ in range(_FAILURE_STEER_THRESHOLD):
            session.record_execution(_make_record("speak", ExecutionStatus.FAILED, result="err"))
        trail = format_audit_trail(session)
        assert "Avoided tools" in trail

    def test_session_summary_includes_pressure(self, session: HarnessState):
        from backend.routes.assistant_tools.harness import generate_session_summary

        session.update_context_pressure(4096, 8192)
        summary = generate_session_summary(session)
        assert "pressure" in summary.lower()


# ---------------------------------------------------------------------------
# Backward compatibility
# ---------------------------------------------------------------------------


class TestBackwardCompatibility:
    def test_to_dict_has_new_fields(self, session: HarnessState):
        d = session.to_dict()
        assert "context_pressure" in d
        assert "avoided_tools" in d
        assert "steering_hints" in d

    def test_budget_exhausted(self, session: HarnessState):
        session.budget_remaining = 0
        assert session.is_budget_exhausted is True

    def test_success_rate(self, session: HarnessState):
        session.record_execution(_make_record("a", ExecutionStatus.COMPLETED))
        session.record_execution(_make_record("b", ExecutionStatus.FAILED, result="err"))
        assert session.success_rate == 0.5
