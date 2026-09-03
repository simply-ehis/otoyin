"""Tests for loudness analysis and subtitle export formatting."""

import numpy as np

from backend.services.loudness import analyze_loudness
from backend.services.subtitles import _build_subs, _format_srt, _format_vtt


def _tone(seconds=1.0, sr=48000):
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    return (0.3 * np.sin(2 * np.pi * 200 * t) + 0.1 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)


def test_analyze_loudness_report():
    report = analyze_loudness(_tone(), 48000)
    assert report["integrated_lufs"] < 0
    assert report["true_peak_dbtp"] <= 0.0
    assert report["crest_factor_db"] > 0
    assert report["duration_seconds"] == 1.0
    assert "rms_db" in report
    assert "loudness_range_lu" in report


def test_analyze_loudness_silence():
    report = analyze_loudness(np.zeros(48000, dtype=np.float32), 48000)
    assert report["integrated_lufs"] == -70.0
    assert report["duration_seconds"] == 1.0


def test_build_subs_splits_text():
    subs = _build_subs("First sentence. Second one. Third.", 3.0)
    assert len(subs) == 3
    assert subs[0][0] == 0.0
    assert subs[-1][1] <= 3.0 + 1e-6


def test_format_srt_valid_cues():
    subs = [(0.0, 1.0, "Hello."), (1.0, 2.5, "World.")]
    srt = _format_srt(subs)
    lines = srt.splitlines()
    assert lines[0] == "1"
    assert "-->" in lines[1]
    assert "00:00:00,000 --> 00:00:01,000" in srt


def test_format_vtt_has_header():
    subs = [(0.0, 1.0, "Hello.")]
    vtt = _format_vtt(subs)
    assert vtt.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:01.000" in vtt
