"""General-MIDI instrument rendering via a SoundFont (TinySoundFont).

Gated optional dependency: ``tinysoundfont`` (pip install tinysoundfont) plus a
GM SoundFont file (e.g. FreePats / FluidR3_GM) in ``data/soundfonts/``. When
either is missing the service raises a clear RuntimeError so the agent can
instruct the user to install/download. Offline, non-destructive.
"""

from pathlib import Path

import numpy as np


def get_soundfont_path() -> Path | None:
    """Return the first available GM SoundFont in the data soundfonts dir."""
    from .. import config

    sf_dir = config.get_data_dir() / "soundfonts"
    sf_dir.mkdir(parents=True, exist_ok=True)
    for name in ("FreePats.sf2", "FluidR3_GM.sf2", "FluidR3_GS.sf2"):
        candidate = sf_dir / name
        if candidate.exists():
            return candidate
    return None


def _to_array(mv: memoryview, samples: int) -> np.ndarray:
    """Convert a TinySoundFont float memoryview to a float32 numpy array (mono/stereo)."""
    arr = np.frombuffer(mv, dtype=np.float32)
    if arr.size == samples * 2:
        arr = arr.reshape(-1, 2)
    return arr.astype(np.float32)


def render_gm_note(
    program: int,
    note: int = 60,
    duration: float = 1.0,
    velocity: float = 0.8,
    sample_rate: int = 48000,
    soundfont: str | None = None,
) -> np.ndarray:
    """Render one GM instrument note (program 0-127) to a float32 WAV array."""
    try:
        import tinysoundfont
    except ImportError as exc:
        raise RuntimeError(
            "tinysoundfont is not installed. Run `pip install tinysoundfont` to enable General-MIDI instruments."
        ) from exc

    sf = soundfont or get_soundfont_path()
    if sf is None:
        raise RuntimeError(
            "No SoundFont found in data/soundfonts. Download a GM SoundFont (e.g. FreePats.sf2) and place it there."
        )

    synth = tinysoundfont.Synth()
    synth.samplerate = sample_rate
    sfid = synth.sfload(str(sf))
    synth.program_select(0, sfid, 0, int(program))
    synth.noteon(0, int(note), int(velocity * 127))
    held = int(duration * sample_rate)
    audio = _to_array(synth.generate(held), held)
    synth.noteoff(0, int(note))
    release = int(0.3 * sample_rate)
    audio = np.concatenate([audio, _to_array(synth.generate(release), release)])
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * 0.9
    return audio


def render_gm_pattern(
    program: int,
    notes: list[int],
    step_duration: float = 0.25,
    velocity: float = 0.8,
    sample_rate: int = 48000,
    soundfont: str | None = None,
) -> np.ndarray:
    """Render a sequence of GM notes (one per step) into one looped WAV array."""
    if not notes:
        return np.zeros(1, dtype=np.float32)
    step = int(step_duration * sample_rate)
    out = np.zeros((step * len(notes), 2), dtype=np.float32)
    for i, n in enumerate(notes):
        seg = render_gm_note(program, n, step_duration, velocity, sample_rate, soundfont)
        out[i * step : (i + 1) * step] += seg[:step]
    peak = np.abs(out).max()
    if peak > 0:
        out = out / peak * 0.9
    return out.astype(np.float32)
