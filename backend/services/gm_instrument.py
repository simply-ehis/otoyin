"""General-MIDI instrument rendering via a SoundFont (TinySoundFont).

Gated optional dependency: ``tinysoundfont`` (pip install tinysoundfont) plus a
GM SoundFont bank — any instrument-pack bank from the Store (they land in
``data/instruments/<pack>/``), or a manually placed ``.sf2``/``.sf3`` in
``data/soundfonts/``. When both are missing the service raises a clear
RuntimeError. Offline, non-destructive.
"""

from pathlib import Path

import numpy as np

# Full General-MIDI banks the renderer recognizes by name (preferred over
# single-preset banks when several are installed).
_KNOWN_GM_BANKS = ("FreePats.sf2", "FluidR3_GM.sf2", "FluidR3_GS.sf2", "GeneralUser-GS.sf2")


def _find_bank(directory: Path) -> Path | None:
    """Known GM bank by name first, else the largest .sf2/.sf3.

    A full GM set dwarfs one-shots and single presets, so size is a reliable
    tie-breaker when the filename is unfamiliar.
    """
    for name in _KNOWN_GM_BANKS:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    banks = sorted(
        (p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in (".sf2", ".sf3")),
        key=lambda p: (-p.stat().st_size, p.name),
    )
    return banks[0] if banks else None


def get_soundfont_path() -> Path | None:
    """Return the first available GM SoundFont.

    Search order (offline-first, explicit placement wins):
    1. ``data/soundfonts/`` — a manually placed bank.
    2. ``data/instruments/<pack>/`` — a Store/downloaded or uploaded bank.
       Marketplace SoundFont packs land here, so a bank from the Store works
       for GM rendering with no extra step.
    """
    from .. import config

    data = config.get_data_dir()
    sf_dir = data / "soundfonts"
    sf_dir.mkdir(parents=True, exist_ok=True)
    found = _find_bank(sf_dir)
    if found is not None:
        return found
    inst_root = data / "instruments"
    if inst_root.is_dir():
        for pack in sorted(p for p in inst_root.iterdir() if p.is_dir()):
            found = _find_bank(pack)
            if found is not None:
                return found
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
            "No SoundFont found. Download a GM bank from the Store (instrument packs) "
            "or place an .sf2/.sf3 file in data/soundfonts."
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
