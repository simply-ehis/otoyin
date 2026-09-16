"""
Unit tests for the standalone audio editing primitives in
:mod:`backend.services.audio_edit`.

Covers clipboard (copy/cut/paste), time stretch, shout→whisper, and blend.
"""

import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import get_exports_dir, resolve_storage_path, to_storage_path
from backend.services.audio_edit import (
    blend,
    copy_segment,
    cut_segment,
    delete_region,
    fade_in,
    fade_out,
    insert_silence,
    paste_segment,
    shout_to_whisper,
    splice,
    time_stretch,
)

SR = 24000


def _tone(duration_s: float, amp: float = 0.3, freq: float = 220.0) -> np.ndarray:
    n = int(duration_s * SR)
    t = np.arange(n, dtype=np.float32) / SR
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def _write(name: str, audio: np.ndarray) -> str:
    out = get_exports_dir() / name
    sf.write(str(out), audio, SR)
    return str(to_storage_path(out))


def _read(storage_path: str) -> np.ndarray:
    resolved = resolve_storage_path(storage_path)
    if resolved is None:
        resolved = get_exports_dir() / storage_path.replace("\\", "/").split("/")[-1]
    audio, _ = sf.read(str(resolved), dtype="float32", always_2d=False)
    return audio


def test_copy_segment_extracts_region_and_leaves_source():
    src = _write("src_copy.wav", _tone(2.0))
    res = copy_segment(src, 0.5, 1.5)
    assert 1.0 <= res["duration_s"] <= 1.1
    clip = _read(res["output_path"])
    assert len(clip) == pytest.approx(int(1.0 * SR), rel=0.05)
    # Source untouched — still 2s.
    original = _read(src)
    assert len(original) == pytest.approx(int(2.0 * SR), rel=0.05)


def test_cut_segment_removes_region_and_returns_clip():
    src = _write("src_cut.wav", _tone(2.0))
    res = cut_segment(src, 0.5, 1.5)
    remainder = _read(res["output_path"])
    assert len(remainder) == pytest.approx(int(1.0 * SR), rel=0.05)
    clip = _read(res["clip_path"])
    assert len(clip) == pytest.approx(int(1.0 * SR), rel=0.05)


def test_paste_segment_inserts_clip_at_position():
    target = _write("tgt_paste.wav", _tone(2.0))
    clip = _write("clip_paste.wav", _tone(1.0, amp=0.5))
    res = paste_segment(target, clip, at_s=1.0)
    merged = _read(res["output_path"])
    # Insert of 1s into 2s → 3s.
    assert len(merged) == pytest.approx(int(3.0 * SR), rel=0.05)


def test_paste_segment_crossfade_reduces_length_by_overlap():
    target = _write("tgt_cf.wav", _tone(2.0))
    clip = _write("clip_cf.wav", _tone(1.0, amp=0.5))
    res = paste_segment(target, clip, at_s=1.0, crossfade_ms=200.0)
    merged = _read(res["output_path"])
    # 2s + 1s - 0.2s overlap = 2.8s.
    assert len(merged) == pytest.approx(int(2.8 * SR), rel=0.05)


def test_time_stretch_changes_duration_keeps_finite():
    src = _write("src_stretch.wav", _tone(2.0))
    res = time_stretch(src, 2.0)
    assert res["rate"] == 2.0
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(4.0 * SR), rel=0.1)
    assert np.isfinite(out).all()


def test_time_stretch_rate_one_is_passthrough_length():
    src = _write("src_stretch1.wav", _tone(2.0))
    res = time_stretch(src, 1.0)
    assert res["rate"] == 1.0
    assert res["duration_s"] == pytest.approx(2.0, rel=0.05)


def test_shout_to_whisper_attenuates_highs_and_stays_in_range():
    # High-frequency-rich signal so the spectral tilt has something to tame.
    n = int(1.0 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    sig = (0.3 * np.sin(2 * np.pi * 200 * t) + 0.3 * np.sin(2 * np.pi * 6000 * t)).astype(np.float32)
    src = _write("src_whisper.wav", sig)
    res = shout_to_whisper(src, intensity=0.8)
    out = _read(res["output_path"])
    assert np.max(np.abs(out)) <= 1.0
    assert np.isfinite(out).all()
    # High-frequency energy should drop vs the original.
    spec = np.abs(np.fft.rfft(out))
    freqs = np.fft.rfftfreq(len(out), 1.0 / SR)
    hi_energy = spec[(freqs >= 3000)].sum()
    orig_spec = np.abs(np.fft.rfft(sig))
    orig_hi = orig_spec[(freqs >= 3000)].sum()
    assert hi_energy < orig_hi


def test_blend_crossfades_two_clips():
    a = _write("a_blend.wav", _tone(2.0))
    b = _write("b_blend.wav", _tone(2.0, amp=0.5, freq=330.0))
    res = blend(a, b, crossfade_ms=200.0)
    merged = _read(res["output_path"])
    # 2s + 2s - 0.2s overlap = 3.8s.
    assert len(merged) == pytest.approx(int(3.8 * SR), rel=0.05)
    assert np.isfinite(merged).all()


def test_blend_with_gap_inserts_silence():
    a = _write("a_gap.wav", _tone(1.0))
    b = _write("b_gap.wav", _tone(1.0, amp=0.5))
    res = blend(a, b, crossfade_ms=0.0, gap_ms=500.0)
    merged = _read(res["output_path"])
    # 1s + 0.5s gap + 1s = 2.5s.
    assert len(merged) == pytest.approx(int(2.5 * SR), rel=0.05)


# ── fade_in / fade_out ────────────────────────────────────────────────────


def test_fade_in_attenuates_start_and_preserves_duration():
    src = _write("src_fadein.wav", _tone(1.0))
    res = fade_in(src, duration_ms=200.0)
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(1.0 * SR), rel=0.05)
    assert out[0] < 0.05
    assert np.isfinite(out).all()


def test_fade_out_attenuates_tail_and_preserves_duration():
    src = _write("src_fadeout.wav", _tone(1.0))
    res = fade_out(src, duration_ms=200.0)
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(1.0 * SR), rel=0.05)
    assert out[-1] < 0.05
    assert np.isfinite(out).all()


# ── splice (region trim) ──────────────────────────────────────────────────


def test_splice_keeps_region_between_start_and_end():
    src = _write("src_splice.wav", _tone(2.0))
    res = splice(src, start_ms=500.0, end_ms=1500.0)
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(1.0 * SR), rel=0.05)
    assert np.isfinite(out).all()


def test_splice_clamps_out_of_bounds():
    src = _write("src_splice2.wav", _tone(1.0))
    res = splice(src, start_ms=0.0, end_ms=5000.0)
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(1.0 * SR), rel=0.05)


# ── delete_region ──────────────────────────────────────────────────────────


def test_delete_region_removes_middle_section():
    src = _write("src_delreg.wav", _tone(2.0))
    res = delete_region(src, start_ms=500.0, end_ms=1500.0)
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(1.0 * SR), rel=0.05)
    assert np.isfinite(out).all()


# ── insert_silence ────────────────────────────────────────────────────────


def test_insert_silence_adds_gap_at_position():
    src = _write("src_insertsil.wav", _tone(1.0))
    res = insert_silence(src, position_ms=500.0, duration_ms=500.0)
    out = _read(res["output_path"])
    assert len(out) == pytest.approx(int(1.5 * SR), rel=0.05)
    mid = out[int(0.5 * SR) : int(1.0 * SR)]
    assert np.max(np.abs(mid)) < 0.01
    assert np.isfinite(out).all()
