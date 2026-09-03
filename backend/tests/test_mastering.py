"""Tests for professional finishing services: mastering and (gated) stem separation."""

import numpy as np
import pytest

from backend.services.mastering import master_audio
from backend.services.stem_separation import SEPARATION_AVAILABLE, separate_audio

SR = 44100
TONE = (
    0.3 * np.sin(2 * np.pi * 180 * np.arange(SR) / SR) + 0.2 * np.sin(2 * np.pi * 1000 * np.arange(SR) / SR)
).astype(np.float32)


def _peak(audio):
    return float(np.max(np.abs(audio)))


class TestMastering:
    def test_mono_hits_lufs_target(self):
        from backend.services.loudness import measure_loudness

        out = master_audio(TONE, SR, target_lufs=-14.0, true_peak_db=-1.0)
        assert _peak(out) <= 1.0
        lufs = measure_loudness(out, SR)["integrated_lufs"]
        assert abs(lufs - (-14.0)) <= 1.5

    def test_stereo_width_and_clip(self):
        stereo = np.stack([TONE, TONE * 0.9], axis=1)
        out = master_audio(stereo, SR, target_lufs=-14.0, width=0.5)
        assert out.shape[1] == 2
        assert _peak(out) <= 1.0

    def test_empty_audio_passthrough(self):
        out = master_audio(np.zeros(0, dtype=np.float32), SR)
        assert out.shape == (0,)


class TestStemSeparation:
    def test_gated_without_demucs(self):
        if SEPARATION_AVAILABLE:
            pytest.skip("Demucs installed; full separation requires model download")
        with pytest.raises(RuntimeError):
            separate_audio(TONE, SR, stem="vocals")
