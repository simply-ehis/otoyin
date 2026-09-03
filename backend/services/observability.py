"""Lightweight observability for voice chat pipeline.

Provides structured logging, pipeline metrics, and request tracing
without heavy dependencies. All metrics are in-process counters and
timers — no external collector required.
"""

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class PipelineMetrics:
    """Aggregated metrics for a voice chat session or global."""

    sessions_started: int = 0
    sessions_ended: int = 0
    audio_chunks_received: int = 0
    speech_detections: int = 0
    speech_ended_events: int = 0
    stt_calls: int = 0
    stt_errors: int = 0
    llm_calls: int = 0
    llm_errors: int = 0
    tool_calls: int = 0
    tool_confirms: int = 0
    tool_denials: int = 0
    tool_timeouts: int = 0
    tts_calls: int = 0
    tts_errors: int = 0
    barge_ins: int = 0
    responses_sent: int = 0
    errors: int = 0

    # Timing values below are measured in milliseconds
    stt_total_ms: float = 0.0
    llm_total_ms: float = 0.0
    tts_total_ms: float = 0.0
    processing_total_ms: float = 0.0

    def to_dict(self) -> dict:
        return {
            "sessions_started": self.sessions_started,
            "sessions_ended": self.sessions_ended,
            "audio_chunks_received": self.audio_chunks_received,
            "speech_detections": self.speech_detections,
            "speech_ended_events": self.speech_ended_events,
            "stt_calls": self.stt_calls,
            "stt_errors": self.stt_errors,
            "llm_calls": self.llm_calls,
            "llm_errors": self.llm_errors,
            "tool_calls": self.tool_calls,
            "tool_confirms": self.tool_confirms,
            "tool_denials": self.tool_denials,
            "tool_timeouts": self.tool_timeouts,
            "tts_calls": self.tts_calls,
            "tts_errors": self.tts_errors,
            "barge_ins": self.barge_ins,
            "responses_sent": self.responses_sent,
            "errors": self.errors,
            "stt_avg_ms": round(self.stt_total_ms / max(self.stt_calls, 1), 1),
            "llm_avg_ms": round(self.llm_total_ms / max(self.llm_calls, 1), 1),
            "tts_avg_ms": round(self.tts_total_ms / max(self.tts_calls, 1), 1),
            "processing_avg_ms": round(self.processing_total_ms / max(self.responses_sent, 1), 1),
        }


# Global metrics singleton
_global_metrics = PipelineMetrics()
_session_metrics: dict[str, PipelineMetrics] = defaultdict(PipelineMetrics)


def get_global_metrics() -> PipelineMetrics:
    return _global_metrics


def get_session_metrics(session_id: str) -> PipelineMetrics:
    return _session_metrics[session_id]


def reset_session_metrics(session_id: str) -> None:
    _session_metrics.pop(session_id, None)


@dataclass
class StepTimer:
    """Context manager that records elapsed time in ms."""

    name: str
    metrics: PipelineMetrics
    _start: float = field(init=False, default=0.0)

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *args):
        elapsed_ms = (time.perf_counter() - self._start) * 1000
        attr = f"{self.name}_total_ms"
        if hasattr(self.metrics, attr):
            setattr(self.metrics, attr, getattr(self.metrics, attr) + elapsed_ms)
        logger.debug("voice_chat_step step=%s elapsed_ms=%.1f", self.name, elapsed_ms)


def record_stt(metrics: PipelineMetrics, success: bool, elapsed_ms: float = 0):
    metrics.stt_calls += 1
    if not success:
        metrics.stt_errors += 1
    metrics.stt_total_ms += elapsed_ms


def record_llm(metrics: PipelineMetrics, success: bool, elapsed_ms: float = 0):
    metrics.llm_calls += 1
    if not success:
        metrics.llm_errors += 1
    metrics.llm_total_ms += elapsed_ms


def record_tts(metrics: PipelineMetrics, success: bool, elapsed_ms: float = 0):
    metrics.tts_calls += 1
    if not success:
        metrics.tts_errors += 1
    metrics.tts_total_ms += elapsed_ms


def record_tool_call(metrics: PipelineMetrics, confirmed: bool | None = None, timed_out: bool = False):
    metrics.tool_calls += 1
    if timed_out:
        metrics.tool_timeouts += 1
    elif confirmed is True:
        metrics.tool_confirms += 1
    elif confirmed is False:
        metrics.tool_denials += 1
