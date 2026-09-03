"""Multi-track mixer engine for 21labs."""

from dataclasses import dataclass, field

import numpy as np

from ..services.effects_chain import EffectConfig, apply_effects_chain


@dataclass
class TrackConfig:
    id: str
    name: str
    volume: float = 1.0
    pan: float = 0.0
    muted: bool = False
    solo: bool = False
    bus_id: str | None = None
    effects_chain: list[EffectConfig] = field(default_factory=list)


@dataclass
class BusConfig:
    id: str
    name: str
    volume: float = 1.0
    pan: float = 0.0
    effects_chain: list[EffectConfig] = field(default_factory=list)


@dataclass
class MixerState:
    tracks: list[TrackConfig] = field(default_factory=list)
    buses: list[BusConfig] = field(default_factory=list)
    master_volume: float = 1.0


def pan_stereo(audio: np.ndarray, pan: float) -> tuple[np.ndarray, np.ndarray]:
    """Apply stereo panning. pan: -1.0 (left) to 1.0 (right)."""
    left_gain = np.sqrt(0.5 * (1.0 - pan))
    right_gain = np.sqrt(0.5 * (1.0 + pan))
    return audio * left_gain, audio * right_gain


def mix_tracks(
    track_data: list[tuple[np.ndarray, TrackConfig]],
    sample_rate: int,
    total_samples: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Mix multiple tracks into stereo output.

    Returns (left_channel, right_channel).
    """
    left = np.zeros(total_samples, dtype=np.float32)
    right = np.zeros(total_samples, dtype=np.float32)

    any_solo = any(cfg.solo for _, cfg in track_data)

    for audio, cfg in track_data:
        if cfg.muted:
            continue
        if any_solo and not cfg.solo:
            continue

        processed = audio
        if cfg.effects_chain:
            processed = apply_effects_chain(processed, sample_rate, cfg.effects_chain)

        processed = processed * cfg.volume

        lch, rch = pan_stereo(processed, cfg.pan)

        end = min(len(lch), total_samples)
        left[:end] += lch[:end]
        right[:end] += rch[:end]

    return left, right


def mix_with_buses(
    track_data: list[tuple[np.ndarray, TrackConfig]],
    bus_data: dict[str, BusConfig],
    sample_rate: int,
    total_samples: int,
    master_volume: float = 1.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Mix tracks with bus routing, then apply bus effects and master volume."""
    bus_buffers: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    master_left = np.zeros(total_samples, dtype=np.float32)
    master_right = np.zeros(total_samples, dtype=np.float32)

    any_solo = any(cfg.solo for _, cfg in track_data)
    # Active tracks that actually contribute to the mix (after mute/solo).
    active_tracks = [cfg for audio, cfg in track_data if not cfg.muted and (not any_solo or cfg.solo)]
    # Gain staging: prevent N full-scale tracks from clipping during the sum
    # (which would then force a heavy peak-normalize that squashes everything).
    # We attenuate each contributing signal by 1/sqrt(N) before summing — the
    # standard equal-power mix headroom. The final peak-normalize below remains
    # as a safety net for any residual overs.
    staging = 1.0 / np.sqrt(max(len(active_tracks), 1)) if active_tracks else 1.0

    for audio, cfg in track_data:
        if cfg.muted:
            continue
        if any_solo and not cfg.solo:
            continue

        processed = audio
        if cfg.effects_chain:
            processed = apply_effects_chain(processed, sample_rate, cfg.effects_chain)

        processed = processed * cfg.volume * staging
        lch, rch = pan_stereo(processed, cfg.pan)

        if cfg.bus_id and cfg.bus_id in bus_buffers:
            bl, br = bus_buffers[cfg.bus_id]
            end = min(len(lch), total_samples)
            bl[:end] += lch[:end]
            br[:end] += rch[:end]
        else:
            end = min(len(lch), total_samples)
            master_left[:end] += lch[:end]
            master_right[:end] += rch[:end]

    for bus_id, bus_cfg in bus_data.items():
        if bus_id not in bus_buffers:
            continue
        bl, br = bus_buffers[bus_id]
        if bus_cfg.effects_chain:
            bl = apply_effects_chain(bl, sample_rate, bus_cfg.effects_chain)
            br = apply_effects_chain(br, sample_rate, bus_cfg.effects_chain)
        bl = bl * bus_cfg.volume
        br = br * bus_cfg.volume
        bl_p, br_p = pan_stereo(bl, bus_cfg.pan)
        end = min(len(bl_p), total_samples)
        master_left[:end] += bl_p[:end]
        master_right[:end] += br_p[:end]

    master_left *= master_volume
    master_right *= master_volume

    peak = max(np.abs(master_left).max(), np.abs(master_right).max())
    if peak > 1.0:
        master_left /= peak
        master_right /= peak

    return master_left, master_right
