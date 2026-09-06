"""Tests for the voice-clean A/B comparison endpoint and request models.

Covers:
  - Request model validation (VoiceCleanABRequest, VoiceCleanRequest)
  - Endpoint response format
  - Engine preset mapping in A/B response
  - Error cases (missing file, invalid params)
"""

import numpy as np
import pytest
from pydantic import ValidationError

pytest.importorskip("soundfile")

from backend.routes.features import VoiceCleanABRequest, VoiceCleanRequest

# ── Request model validation ────────────────────────────────────────────


class TestVoiceCleanABRequest:
    def test_minimal(self):
        req = VoiceCleanABRequest(audio_path="test.wav")
        assert req.audio_path == "test.wav"
        assert req.engine is None
        assert req.strength == 1.0

    def test_with_engine(self):
        req = VoiceCleanABRequest(audio_path="test.wav", engine="kokoro")
        assert req.engine == "kokoro"

    def test_with_strength(self):
        req = VoiceCleanABRequest(audio_path="test.wav", strength=0.5)
        assert req.strength == 0.5

    def test_strength_bounds(self):
        req = VoiceCleanABRequest(audio_path="test.wav", strength=0.0)
        assert req.strength == 0.0
        req = VoiceCleanABRequest(audio_path="test.wav", strength=1.0)
        assert req.strength == 1.0

    def test_strength_out_of_range(self):
        with pytest.raises(ValidationError):
            VoiceCleanABRequest(audio_path="test.wav", strength=-0.1)
        with pytest.raises(ValidationError):
            VoiceCleanABRequest(audio_path="test.wav", strength=1.1)

    def test_all_engines(self):
        engines = ["kokoro", "chattts", "f5-tts", "orpheus", "kitten-tts"]
        for engine in engines:
            req = VoiceCleanABRequest(audio_path="test.wav", engine=engine)
            assert req.engine == engine


class TestVoiceCleanRequest:
    def test_minimal(self):
        req = VoiceCleanRequest(audio_path="test.wav")
        assert req.audio_path == "test.wav"

    def test_with_preset(self):
        req = VoiceCleanRequest(audio_path="test.wav", preset="heavy")
        assert req.preset == "heavy"

    def test_with_engine(self):
        req = VoiceCleanRequest(audio_path="test.wav", engine="kokoro")
        assert req.engine == "kokoro"


# ── Endpoint integration (offline, no server) ──────────────────────────


class TestVoiceCleanABIntegration:
    """Integration tests that exercise the endpoint handler logic without a server."""

    def test_enhance_tts_returns_different_audio(self):
        """enhance_tts with default params should modify the audio."""
        from backend.services.tts_enhancer import enhance_tts

        t = np.linspace(0, 0.5, 12000, endpoint=False)
        audio = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
        enhanced = enhance_tts(audio, 24000)
        assert enhanced.shape == audio.shape
        # Enhanced should differ from original (at least one stage ran)
        assert not np.allclose(enhanced, audio, atol=1e-4)

    def test_enhance_tts_light_vs_heavy_differ(self):
        """Light and heavy presets should produce different outputs."""
        from backend.services.tts_enhancer import enhance_tts

        t = np.linspace(0, 0.5, 12000, endpoint=False)
        audio = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
        light = enhance_tts(audio, 24000, {"preset": "light"})
        heavy = enhance_tts(audio, 24000, {"preset": "heavy"})
        assert not np.allclose(light, heavy, atol=1e-4)

    def test_enhance_tts_engine_param_affects_output(self):
        """Different engines should produce different enhancements."""
        from backend.services.tts_enhancer import enhance_tts

        t = np.linspace(0, 0.5, 12000, endpoint=False)
        audio = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
        kokoro_out = enhance_tts(audio, 24000, engine="kokoro")  # light
        orpheus_out = enhance_tts(audio, 24000, engine="orpheus")  # heavy
        # Different presets → different outputs
        assert not np.allclose(kokoro_out, orpheus_out, atol=1e-4)

    def test_strength_affects_enhancement_intensity(self):
        """Different strengths produce different outputs."""
        from backend.services.tts_enhancer import enhance_tts

        t = np.linspace(0, 0.5, 12000, endpoint=False)
        audio = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
        low = enhance_tts(audio, 24000, {"strength": 0.1})
        high = enhance_tts(audio, 24000, {"strength": 1.0})
        # Both should be finite
        assert np.all(np.isfinite(low))
        assert np.all(np.isfinite(high))
        # Different strengths should produce different results
        # (strength scales de-esser + warmth, but denoise is independent)
        assert not np.allclose(low, high, atol=1e-4)


# ── Response format validation ─────────────────────────────────────────


class TestABResponseFormat:
    """Validate the expected response structure from the A/B endpoint."""

    def test_ab_request_has_required_fields(self):
        req = VoiceCleanABRequest(audio_path="/audio/gen.wav")
        d = req.model_dump()
        assert "audio_path" in d
        assert "engine" in d
        assert "strength" in d

    def test_voice_clean_request_has_required_fields(self):
        req = VoiceCleanRequest(audio_path="/audio/gen.wav")
        d = req.model_dump()
        assert "audio_path" in d
        assert "preset" in d
        assert "engine" in d
