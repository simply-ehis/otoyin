"""16-step drum pattern sequencer using the existing synthesized drum pads.

Builds a looped WAV from a pattern of drum hits. Offline, non-destructive.

Two pattern forms:
- ``lanes``: drum voice -> per-step velocity (0..1, 0 = rest). This is the
  lane x step grid the Instruments tab edits.
- ``pattern`` (legacy): list of steps, each a voice name or list of names.
  Kept for the MCP/assistant tools. ``lanes`` wins when both are given.
"""

from collections.abc import Mapping, Sequence

import numpy as np

from .instruments import generate_drum_pad

_DRUM_VOICES = ("kick", "snare", "hihat", "clap", "tom")

# (voice, step index, relative velocity 0..1)
_Hit = tuple[str, int, float]


def _voices_for_step(step: object) -> list[str]:
    if step is None or step == "" or step == []:
        return []
    if isinstance(step, str):
        return [step] if step in _DRUM_VOICES else []
    if isinstance(step, (list, tuple, set)):
        return [v for v in step if v in _DRUM_VOICES]
    return []


def _pattern_hits(pattern: Sequence | None) -> list[_Hit]:
    """Legacy list-of-steps form; every hit plays at the global velocity."""
    return [(voice, index, 1.0) for index, step in enumerate(pattern or []) for voice in _voices_for_step(step)]


def _lane_hits(lanes: Mapping[str, Sequence[float]]) -> list[_Hit]:
    """Lane form: per-step velocity, <= 0 is a rest, unknown voices dropped."""
    return [
        (voice, index, level)
        for voice, steps in lanes.items()
        if voice in _DRUM_VOICES
        for index, level in enumerate(steps)
        if level > 0
    ]


def render_drum_pattern(
    pattern: Sequence | None = None,
    step_duration: float = 0.125,
    bars: int = 1,
    velocity: float = 0.8,
    sample_rate: int = 48000,
    *,
    lanes: Mapping[str, Sequence[float]] | None = None,
    swing: float = 0.0,
) -> np.ndarray:
    """Render a ``bars`` x steps drum loop as float32 WAV audio.

    ``lanes`` wins when given: the bar is the longest lane, shorter lanes
    rest after their steps. ``swing`` (0..0.5) delays every off-step (odd
    index) by that fraction of a step; 0.5 is a full triplet shuffle.
    """
    if lanes:
        hits = _lane_hits(lanes)
        steps = max(len(velocities) for velocities in lanes.values())
    else:
        hits = _pattern_hits(pattern)
        steps = len(pattern) if pattern else 0
    if steps == 0 or bars < 1:
        return np.zeros(1, dtype=np.float32)
    step_samples = int(step_duration * sample_rate)
    swing_samples = int(swing * step_duration * sample_rate)
    out = np.zeros(steps * step_samples * bars, dtype=np.float32)
    for bar in range(bars):
        for voice, index, level in hits:
            offset = (bar * steps + index) * step_samples
            if index % 2:
                offset += swing_samples
            hit = generate_drum_pad(voice, step_duration * 0.9, level * velocity, sample_rate)
            # A swung hit near the loop end can run past the buffer: clip its tail there.
            end = min(offset + step_samples, offset + len(hit), len(out))
            out[offset:end] += hit[: end - offset]
    peak = np.abs(out).max()
    if peak > 0:
        out = out / peak * 0.9
    return out.astype(np.float32)
