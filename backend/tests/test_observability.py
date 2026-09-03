"""Tests for the voice chat observability module."""

from backend.services.observability import (
    PipelineMetrics,
    StepTimer,
    get_global_metrics,
    get_session_metrics,
    record_llm,
    record_stt,
    record_tool_call,
    record_tts,
    reset_session_metrics,
)


class TestPipelineMetrics:
    def test_to_dict(self):
        m = PipelineMetrics()
        d = m.to_dict()
        assert d["sessions_started"] == 0
        assert d["stt_avg_ms"] == 0.0
        assert d["llm_avg_ms"] == 0.0
        assert d["tts_avg_ms"] == 0.0

    def test_to_dict_averages(self):
        m = PipelineMetrics(stt_calls=3, stt_total_ms=300.0)
        d = m.to_dict()
        assert d["stt_avg_ms"] == 100.0


class TestRecordFunctions:
    def test_record_stt_success(self):
        m = PipelineMetrics()
        record_stt(m, True, 50.0)
        assert m.stt_calls == 1
        assert m.stt_errors == 0
        assert m.stt_total_ms == 50.0

    def test_record_stt_failure(self):
        m = PipelineMetrics()
        record_stt(m, False, 10.0)
        assert m.stt_calls == 1
        assert m.stt_errors == 1

    def test_record_llm_success(self):
        m = PipelineMetrics()
        record_llm(m, True, 200.0)
        assert m.llm_calls == 1
        assert m.llm_errors == 0
        assert m.llm_total_ms == 200.0

    def test_record_llm_failure(self):
        m = PipelineMetrics()
        record_llm(m, False, 5.0)
        assert m.llm_errors == 1

    def test_record_tts_success(self):
        m = PipelineMetrics()
        record_tts(m, True, 100.0)
        assert m.tts_calls == 1
        assert m.tts_total_ms == 100.0

    def test_record_tool_call_confirmed(self):
        m = PipelineMetrics()
        record_tool_call(m, confirmed=True)
        assert m.tool_calls == 1
        assert m.tool_confirms == 1

    def test_record_tool_call_denied(self):
        m = PipelineMetrics()
        record_tool_call(m, confirmed=False)
        assert m.tool_denials == 1

    def test_record_tool_call_timeout(self):
        m = PipelineMetrics()
        record_tool_call(m, timed_out=True)
        assert m.tool_timeouts == 1


class TestSessionMetrics:
    def test_get_session_metrics_returns_instance(self):
        m1 = get_session_metrics("sess-abc")
        m2 = get_session_metrics("sess-abc")
        assert m1 is m2

    def test_reset_session_metrics(self):
        m = get_session_metrics("sess-rm")
        m.errors = 5
        reset_session_metrics("sess-rm")
        m2 = get_session_metrics("sess-rm")
        assert m2.errors == 0


class TestGlobalMetrics:
    def test_singleton(self):
        g1 = get_global_metrics()
        g2 = get_global_metrics()
        assert g1 is g2


class TestStepTimer:
    def test_step_timer_records_elapsed(self):
        m = PipelineMetrics()
        with StepTimer("stt", m):
            pass
        assert m.stt_total_ms >= 0

    def test_step_timer_noop_for_unknown_attr(self):
        m = PipelineMetrics()
        with StepTimer("nonexistent", m):
            pass
        # Should not raise
