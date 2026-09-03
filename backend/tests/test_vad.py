"""Tests for the Silero VAD service."""

import numpy as np
import pytest


class TestSileroVADEnergyFallback:
    """Test the energy-based fallback when Silero is unavailable."""

    def _make_vad(self):
        from backend.services.vad import SileroVAD

        vad = SileroVAD(threshold=0.5, min_speech_frames=3, min_silence_frames=3)
        # Force energy fallback by clearing the ONNX session and preventing reload
        vad._session = None
        vad._model_load_failed = True
        return vad

    def test_silence_returns_no_speech(self):
        vad = self._make_vad()
        chunk = np.zeros(512, dtype=np.float32)
        result = vad.detect(chunk)
        assert result["is_speech"] is False
        assert result["speech_prob"] == 0.0

    def test_loud_audio_detected_as_speech(self):
        vad = self._make_vad()
        # Generate loud audio (sine wave at 0.8 amplitude)
        chunk = np.sin(np.linspace(0, 2 * np.pi * 440, 512)).astype(np.float32) * 0.8
        # Run multiple frames to get past min_speech_frames
        for _ in range(5):
            result = vad.detect(chunk)
        assert result["is_speech"] is True
        assert result["speech_prob"] > 0.5

    def test_speech_started_event(self):
        vad = self._make_vad()
        loud = np.sin(np.linspace(0, 2 * np.pi * 440, 512)).astype(np.float32) * 0.8

        # First few frames should trigger speech_started
        for _ in range(5):
            result = vad.detect(loud)
            if result["speech_started"]:
                assert result["is_speech"] is True
                return
        pytest.fail("speech_started never triggered")

    def test_speech_ended_event(self):
        vad = self._make_vad()
        loud = np.sin(np.linspace(0, 2 * np.pi * 440, 512)).astype(np.float32) * 0.8
        silence = np.zeros(512, dtype=np.float32)

        # Start speech
        for _ in range(5):
            vad.detect(loud)

        # End speech
        for _ in range(10):
            result = vad.detect(silence)
            if result["speech_ended"]:
                assert result["is_speech"] is False
                return
        pytest.fail("speech_ended never triggered")

    def test_reset_clears_state(self):
        vad = self._make_vad()
        loud = np.sin(np.linspace(0, 2 * np.pi * 440, 512)).astype(np.float32) * 0.8

        # Start speech
        for _ in range(5):
            vad.detect(loud)

        vad.reset()
        assert vad._speech_count == 0
        assert vad._silence_count == 0
        assert vad._is_speech is False

    def test_empty_chunk(self):
        vad = self._make_vad()
        result = vad.detect(np.array([], dtype=np.float32))
        assert result["is_speech"] is False
        assert result["speech_prob"] == 0.0


class TestVADSingleton:
    """Test the shared VAD instance."""

    def test_get_vad_returns_instance(self):
        from backend.services.vad import get_vad

        vad = get_vad()
        assert vad is not None

    def test_get_vad_returns_same_instance(self):
        from backend.services.vad import get_vad

        vad1 = get_vad()
        vad2 = get_vad()
        assert vad1 is vad2

    def test_reset_vad(self):
        from backend.services.vad import get_vad, reset_vad

        vad = get_vad()
        reset_vad()
        assert vad._speech_count == 0
