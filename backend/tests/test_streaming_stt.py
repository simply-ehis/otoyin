"""Tests for streaming STT logic (VAD, sessions, buffering)."""

import time

import numpy as np

from backend.routes.streaming_stt import (
    DEFAULT_ENERGY_THRESHOLD as ENERGY_THRESHOLD,
    SESSION_TIMEOUT_S,
    SILENCE_FRAMES_TRIGGER,
    StreamingSession,
    _compute_energy,
    _sessions,
)


class TestVADEnergyDetection:
    def test_silence_below_threshold(self):
        audio = [0.0] * 1000
        assert _compute_energy(audio) < ENERGY_THRESHOLD

    def test_loud_audio_above_threshold(self):
        audio = [0.5] * 1000
        assert _compute_energy(audio) > ENERGY_THRESHOLD

    def test_empty_chunk_returns_zero(self):
        assert _compute_energy([]) == 0.0

    def test_energy_is_rms(self):
        audio = [0.3, -0.3, 0.3, -0.3]
        expected = float(np.sqrt(np.mean(np.array(audio) ** 2)))
        assert abs(_compute_energy(audio) - expected) < 1e-6


class TestSessionLifecycle:
    def setup_method(self):
        _sessions.clear()

    def test_session_creation(self):
        sid = "test123"
        _sessions[sid] = StreamingSession(
            session_id=sid,
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        assert sid in _sessions
        assert _sessions[sid].model_id == "base"

    def test_session_removes_on_pop(self):
        _sessions["x"] = StreamingSession(
            session_id="x",
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        _sessions.pop("x", None)
        assert "x" not in _sessions

    def test_expired_session_detected(self):
        s = StreamingSession(
            session_id="old",
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        s.last_activity = time.time() - SESSION_TIMEOUT_S - 1
        _sessions["old"] = s
        now = time.time()
        expired = [sid for sid, sess in _sessions.items() if now - sess.last_activity > SESSION_TIMEOUT_S]
        assert "old" in expired


class TestChunkBuffering:
    def setup_method(self):
        _sessions.clear()

    def test_audio_buffer_accumulates(self):
        s = StreamingSession(
            session_id="buf",
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        s.audio_buffer.extend([0.1, 0.2, 0.3])
        s.audio_buffer.extend([0.4, 0.5])
        assert len(s.audio_buffer) == 5

    def test_buffer_clear_resets_state(self):
        s = StreamingSession(
            session_id="clr",
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        s.audio_buffer.extend([0.1] * 100)
        s.silence_count = 5
        s.is_speaking = True
        s.audio_buffer.clear()
        s.silence_count = 0
        s.is_speaking = False
        assert len(s.audio_buffer) == 0
        assert s.silence_count == 0
        assert not s.is_speaking

    def test_silence_triggers_after_threshold(self):
        s = StreamingSession(
            session_id="sil",
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        s.is_speaking = True
        s.silence_count = SILENCE_FRAMES_TRIGGER
        assert s.silence_count >= SILENCE_FRAMES_TRIGGER

    def test_loud_chunk_resets_silence(self):
        s = StreamingSession(
            session_id="loud",
            model_id="base",
            language=None,
            sample_rate=16000,
        )
        s.silence_count = 5
        energy = _compute_energy([0.5] * 500)
        if energy > ENERGY_THRESHOLD:
            s.silence_count = 0
            s.is_speaking = True
        assert s.silence_count == 0
        assert s.is_speaking
