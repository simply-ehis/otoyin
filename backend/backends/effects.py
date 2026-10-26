"""Spotify Pedalboard effects wrapper."""

from __future__ import annotations

import io
import logging
import struct
from typing import Any

logger = logging.getLogger(__name__)

try:
    import pedalboard as pb
    PEDALBOARD_AVAILABLE = True
except ImportError:
    PEDALBOARD_AVAILABLE = False
    logger.warning("pedalboard not installed")

EFFECT_PRESETS = {
    "vocal_polish": [
        ("compressor", {"threshold_db": -20, "ratio": 4, "attack_ms": 5, "release_ms": 50}),
        ("eq", {"low_gain_db": -2, "low_freq": 80, "mid_gain_db": 2, "mid_freq": 3000, "high_gain_db": 1, "high_freq": 10000}),
        ("reverb", {"room_size": 0.2, "damping": 0.5, "wet_level": 0.15, "dry_level": 0.85}),
        ("gain", {"gain_db": 2}),
    ],
    "podcast_master": [
        ("highpass", {"cutoff_hz": 80}),
        ("compressor", {"threshold_db": -18, "ratio": 3, "attack_ms": 10, "release_ms": 100}),
        ("eq", {"low_gain_db": -1, "low_freq": 100, "mid_gain_db": 1, "mid_freq": 2000, "high_gain_db": 2, "high_freq": 8000}),
        ("limiter", {"threshold_db": -3, "release_ms": 50}),
    ],
    "music_master": [
        ("eq", {"low_gain_db": 1, "low_freq": 60, "mid_gain_db": 0, "mid_freq": 1000, "high_gain_db": 1, "high_freq": 12000}),
        ("compressor", {"threshold_db": -12, "ratio": 2, "attack_ms": 10, "release_ms": 100}),
        ("reverb", {"room_size": 0.3, "damping": 0.4, "wet_level": 0.1, "dry_level": 0.9}),
        ("limiter", {"threshold_db": -1, "release_ms": 50}),
    ],
}

def _create_effect(effect_id: str, params: dict[str, Any]) -> Any:
    if not PEDALBOARD_AVAILABLE:
        return None
    eid = effect_id.replace("builtin-", "").replace("-", "_")
    if eid == "reverb":
        return pb.Reverb(room_size=params.get("room_size", 0.3), damping=params.get("damping", 0.5), wet_level=params.get("wet_level", params.get("mix", 0.3)), dry_level=params.get("dry_level", 1.0 - params.get("mix", 0.3)))
    elif eid == "delay":
        return pb.Delay(delay_seconds=params.get("time", params.get("delay_seconds", 0.25)), feedback=params.get("feedback", 0.3), mix=params.get("mix", 0.3))
    elif eid == "chorus":
        return pb.Chorus(rate_hz=params.get("rate", 1.0), depth=params.get("depth", 0.25), mix=params.get("mix", 0.5))
    elif eid == "compressor":
        return pb.Compressor(threshold_db=params.get("threshold_db", params.get("threshold", -20)), ratio=params.get("ratio", 4), attack_ms=params.get("attack_ms", params.get("attack", 0.003) * 1000), release_ms=params.get("release_ms", params.get("release", 0.1) * 1000))
    elif eid == "limiter":
        return pb.Limiter(threshold_db=params.get("threshold_db", params.get("threshold", -3)), release_ms=params.get("release_ms", params.get("release", 0.05) * 1000))
    elif eid == "gain":
        return pb.Gain(gain_db=params.get("gain_db", params.get("gain", 0)))
    elif eid == "distortion":
        return pb.Distortion(drive_db=params.get("drive_db", params.get("drive", 12)))
    elif eid == "phaser":
        return pb.Phaser(rate_hz=params.get("rate", 1.0), depth=params.get("depth", 0.5), mix=params.get("mix", 0.5))
    elif eid == "pitch_shift":
        return pb.PitchShift(semitones=params.get("semitones", 0))
    elif eid == "resample":
        return pb.Resample(sample_rate=params.get("sample_rate", 44100))
    else:
        logger.warning("Unknown effect: %s", effect_id)
        return None


def _build_pedalboard(chain):
    if not PEDALBOARD_AVAILABLE:
        raise RuntimeError("pedalboard is not installed")
    board = pb.Pedalboard()
    for item in chain:
        effect_id = item.get("id", item.get("pluginId", ""))
        params = item.get("params", {})
        effect = _create_effect(effect_id, params)
        if effect is not None:
            board.append(effect)
    return board


def get_available_effects():
    if not PEDALBOARD_AVAILABLE:
        return []
    return [
        {"type": "reverb", "label": "Reverb", "description": "Spatial reverb effect", "params": {"room_size": {"default": 0.3, "min": 0, "max": 1, "step": 0.01, "description": "Room size"}, "damping": {"default": 0.5, "min": 0, "max": 1, "step": 0.01, "description": "Damping"}, "wet_level": {"default": 0.3, "min": 0, "max": 1, "step": 0.01, "description": "Wet level"}, "dry_level": {"default": 0.7, "min": 0, "max": 1, "step": 0.01, "description": "Dry level"}}},
        {"type": "delay", "label": "Delay", "description": "Time-based delay effect", "params": {"time": {"default": 0.25, "min": 0, "max": 2, "step": 0.01, "description": "Delay time"}, "feedback": {"default": 0.3, "min": 0, "max": 0.95, "step": 0.01, "description": "Feedback"}, "mix": {"default": 0.3, "min": 0, "max": 1, "step": 0.01, "description": "Mix"}}},
        {"type": "chorus", "label": "Chorus", "description": "Chorus modulation effect", "params": {"rate": {"default": 1.0, "min": 0.1, "max": 10, "step": 0.1, "description": "Rate"}, "depth": {"default": 0.25, "min": 0, "max": 1, "step": 0.01, "description": "Depth"}, "mix": {"default": 0.5, "min": 0, "max": 1, "step": 0.01, "description": "Mix"}}},
        {"type": "phaser", "label": "Phaser", "description": "Phaser modulation effect", "params": {"rate": {"default": 1.0, "min": 0.1, "max": 10, "step": 0.1, "description": "Rate"}, "depth": {"default": 0.5, "min": 0, "max": 1, "step": 0.01, "description": "Depth"}, "mix": {"default": 0.5, "min": 0, "max": 1, "step": 0.01, "description": "Mix"}}},
        {"type": "flanger", "label": "Flanger", "description": "Flanger modulation effect", "params": {"rate": {"default": 0.5, "min": 0.1, "max": 10, "step": 0.1, "description": "Rate"}, "depth": {"default": 0.5, "min": 0, "max": 1, "step": 0.01, "description": "Depth"}, "mix": {"default": 0.5, "min": 0, "max": 1, "step": 0.01, "description": "Mix"}}},
        {"type": "compressor", "label": "Compressor", "description": "Dynamic range compressor", "params": {"threshold_db": {"default": -20, "min": -60, "max": 0, "step": 1, "description": "Threshold (dB)"}, "ratio": {"default": 4, "min": 1, "max": 20, "step": 1, "description": "Ratio"}, "attack_ms": {"default": 5, "min": 0.1, "max": 100, "step": 0.1, "description": "Attack (ms)"}, "release_ms": {"default": 50, "min": 1, "max": 1000, "step": 1, "description": "Release (ms)"}}},
        {"type": "limiter", "label": "Limiter", "description": "Peak limiter", "params": {"threshold_db": {"default": -3, "min": -20, "max": 0, "step": 1, "description": "Threshold (dB)"}, "release_ms": {"default": 50, "min": 1, "max": 1000, "step": 1, "description": "Release (ms)"}}},
        {"type": "gain", "label": "Gain", "description": "Gain adjustment", "params": {"gain_db": {"default": 0, "min": -24, "max": 24, "step": 0.1, "description": "Gain (dB)"}}},
        {"type": "distortion", "label": "Distortion", "description": "Distortion/saturation", "params": {"drive_db": {"default": 12, "min": 0, "max": 40, "step": 1, "description": "Drive (dB)"}}},
        {"type": "pitch_shift", "label": "Pitch Shift", "description": "Pitch shifting", "params": {"semitones": {"default": 0, "min": -12, "max": 12, "step": 1, "description": "Semitones"}}},
        {"type": "resample", "label": "Resample", "description": "Sample rate conversion", "params": {"sample_rate": {"default": 44100, "min": 8000, "max": 96000, "step": 1000, "description": "Sample rate"}}},
    ]


def get_available_presets():
    return [{"id": k, "name": k.replace("_", " ").title()} for k in EFFECT_PRESETS]

def process_audio(audio_bytes, sample_rate, chain, preset=None):
    import io
    import struct
    import numpy as np

    if not PEDALBOARD_AVAILABLE:
        raise RuntimeError("pedalboard is not installed")

    audio = np.frombuffer(audio_bytes, dtype=np.float32)
    if audio.size == 0:
        raise ValueError("Empty audio input")

    if audio.ndim == 1:
        audio = audio.reshape(-1, 1)

    if preset and preset in EFFECT_PRESETS:
        chain = [{"id": eid, "params": params} for eid, params in EFFECT_PRESETS[preset]]

    board = _build_pedalboard(chain)
    if board is None or len(board) == 0:
        return audio_bytes

    processed = board(audio.T, sample_rate=sample_rate)
    processed = processed.T.flatten()

    buf = io.BytesIO()
    n_channels = audio.shape[1]
    n_samples = len(processed) // n_channels
    bits_per_sample = 32
    byte_rate = sample_rate * n_channels * bits_per_sample // 8
    block_align = n_channels * bits_per_sample // 8
    data_size = n_samples * n_channels * bits_per_sample // 8

    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<IHHIIHH", 16, 3, sample_rate, byte_rate, block_align, bits_per_sample, 0))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(processed.astype(np.float32).tobytes())

    return buf.getvalue()