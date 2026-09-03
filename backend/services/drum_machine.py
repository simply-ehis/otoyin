"""16-step drum pattern sequencer using the existing synthesized drum pads.

Builds a looped WAV from a pattern of drum hits. Offline, non-destructive.
"""

from collections.abc import Sequence

import numpy as np

from .instruments import generate_drum_pad

_DRUM_VOICES = ("kick", "snare", "hihat", "clap", "tom")


def _voices_for_step(step: object) -> list[str]:
    if step is None or step == "" or step == []:
        return []
    if isinstance(step, str):
        return [step] if step in _DRUM_VOICES else []
    if isinstance(step, (list, tuple, set)):
        return [v for v in step if v in _DRUM_VOICES]
    return []


def render_drum_pattern(
    pattern: Sequence,
    step_duration: float = 0.125,
    bars: int = 1,
    velocity: float = 0.8,
    sample_rate: int = 48000,
) -> np.ndarray:
    """Render a ``bars`` x ``len(pattern)`` drum loop.

    ``pattern`` is a list of steps; each step is a voice name or a list of
    voice names (kick/snare/hihat/clap/tom). Returns float32 WAV audio.
    """
    steps = len(pattern)
    if steps == 0 or bars < 1:
        return np.zeros(1, dtype=np.float32)
    step_samples = int(step_duration * sample_rate)
    total = steps * step_samples * bars
    out = np.zeros(total, dtype=np.float32)
    for bar in range(bars):
        for i, step in enumerate(pattern):
            offset = (bar * steps + i) * step_samples
            for voice in _voices_for_step(step):
                hit = generate_drum_pad(voice, step_duration * 0.9, velocity, sample_rate)
                end = min(offset + step_samples, offset + len(hit))
                out[offset:end] += hit[: end - offset]
    peak = np.abs(out).max()
    if peak > 0:
        out = out / peak * 0.9
    return out.astype(np.float32)
