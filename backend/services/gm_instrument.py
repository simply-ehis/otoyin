"""General-MIDI instrument rendering via a SoundFont (TinySoundFont).

Gated optional dependency: ``tinysoundfont`` (pip install tinysoundfont) plus a
GM SoundFont bank — any instrument-pack bank from the Store (they land in
``data/instruments/<pack>/``), or a manually placed ``.sf2``/``.sf3`` in
``data/soundfonts/``. When both are missing the service raises a clear
RuntimeError. Offline, non-destructive.
"""

from collections.abc import Sequence
from pathlib import Path

import numpy as np

# Full General-MIDI banks the renderer recognizes by name (preferred over
# single-preset banks when several are installed).
_KNOWN_GM_BANKS = ("FreePats.sf2", "FluidR3_GM.sf2", "FluidR3_GS.sf2", "GeneralUser-GS.sf2")

# GM defines 16 instrument families of 8 programs each (program // 8).
_GM_FAMILIES = (
    "Piano",
    "Chromatic Percussion",
    "Organ",
    "Guitar",
    "Bass",
    "Strings",
    "Ensemble",
    "Brass",
    "Reed",
    "Pipe",
    "Synth Lead",
    "Synth Pad",
    "Synth Effects",
    "Ethnic",
    "Percussive",
    "Sound Effects",
)

# The 128 GM program names, index = program number (0-based: 0 is piano).
_GM_PROGRAM_NAMES = (
    "Acoustic Grand Piano",
    "Bright Acoustic Piano",
    "Electric Grand Piano",
    "Honky-tonk Piano",
    "Electric Piano 1",
    "Electric Piano 2",
    "Harpsichord",
    "Clavi",
    "Celesta",
    "Glockenspiel",
    "Music Box",
    "Vibraphone",
    "Marimba",
    "Xylophone",
    "Tubular Bells",
    "Dulcimer",
    "Drawbar Organ",
    "Percussive Organ",
    "Rock Organ",
    "Church Organ",
    "Reed Organ",
    "Accordion",
    "Harmonica",
    "Tango Accordion",
    "Acoustic Guitar (nylon)",
    "Acoustic Guitar (steel)",
    "Electric Guitar (jazz)",
    "Electric Guitar (clean)",
    "Electric Guitar (muted)",
    "Overdriven Guitar",
    "Distortion Guitar",
    "Guitar Harmonics",
    "Acoustic Bass",
    "Electric Bass (finger)",
    "Electric Bass (pick)",
    "Fretless Bass",
    "Slap Bass 1",
    "Slap Bass 2",
    "Synth Bass 1",
    "Synth Bass 2",
    "Violin",
    "Viola",
    "Cello",
    "Contrabass",
    "Tremolo Strings",
    "Pizzicato Strings",
    "Orchestral Harp",
    "Timpani",
    "String Ensemble 1",
    "String Ensemble 2",
    "Synth Strings 1",
    "Synth Strings 2",
    "Choir Aahs",
    "Voice Oohs",
    "Synth Voice",
    "Orchestra Hit",
    "Trumpet",
    "Trombone",
    "Tuba",
    "Muted Trumpet",
    "French Horn",
    "Brass Section",
    "Synth Brass 1",
    "Synth Brass 2",
    "Soprano Sax",
    "Alto Sax",
    "Tenor Sax",
    "Baritone Sax",
    "Oboe",
    "English Horn",
    "Bassoon",
    "Clarinet",
    "Piccolo",
    "Flute",
    "Recorder",
    "Pan Flute",
    "Blown Bottle",
    "Shakuhachi",
    "Whistle",
    "Ocarina",
    "Lead 1 (square)",
    "Lead 2 (sawtooth)",
    "Lead 3 (calliope)",
    "Lead 4 (chiff)",
    "Lead 5 (charang)",
    "Lead 6 (voice)",
    "Lead 7 (fifths)",
    "Lead 8 (bass + lead)",
    "Pad 1 (new age)",
    "Pad 2 (warm)",
    "Pad 3 (polysynth)",
    "Pad 4 (choir)",
    "Pad 5 (bowed)",
    "Pad 6 (metallic)",
    "Pad 7 (halo)",
    "Pad 8 (sweep)",
    "FX 1 (rain)",
    "FX 2 (soundtrack)",
    "FX 3 (crystal)",
    "FX 4 (atmosphere)",
    "FX 5 (brightness)",
    "FX 6 (goblins)",
    "FX 7 (echoes)",
    "FX 8 (sci-fi)",
    "Sitar",
    "Banjo",
    "Shamisen",
    "Koto",
    "Kalimba",
    "Bagpipe",
    "Fiddle",
    "Shanai",
    "Tinkle Bell",
    "Agogo",
    "Steel Drums",
    "Woodblock",
    "Taiko Drum",
    "Melodic Tom",
    "Synth Drum",
    "Reverse Cymbal",
    "Guitar Fret Noise",
    "Breath Noise",
    "Seashore",
    "Bird Tweet",
    "Telephone Ring",
    "Helicopter",
    "Applause",
    "Gunshot",
)


def gm_program_catalog() -> list[dict[str, int | str]]:
    """Structured GM program list for discovery endpoints: program, name, family."""
    return [
        {"program": program, "name": name, "family": _GM_FAMILIES[program // 8]}
        for program, name in enumerate(_GM_PROGRAM_NAMES)
    ]


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


def render_gm_pattern_multi(
    steps: Sequence[Sequence[tuple[int, int, float]]],
    step_duration: float = 0.25,
    bars: int = 1,
    sample_rate: int = 48000,
    soundfont: str | None = None,
) -> np.ndarray:
    """Render several GM instruments as one mixed loop.

    ``steps`` is one entry per step; each entry lists ``(program, note,
    velocity)`` triples for the notes that play together at that step. The
    SoundFont is loaded once on one synth and each program gets its own MIDI
    channel so ``program_select`` happens once per program. Returns float32
    stereo WAV audio.
    """
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

    if not steps:
        return np.zeros(1, dtype=np.float32)

    synth = tinysoundfont.Synth()
    synth.samplerate = sample_rate
    sfid = synth.sfload(str(sf))
    step = int(step_duration * sample_rate)
    release = int(0.3 * sample_rate)
    total = step * len(steps) * bars + release
    out = np.zeros((total, 2), dtype=np.float32)

    # One MIDI channel per program so program_select happens once per program;
    # the renderer has 16 channels.
    channels: dict[int, int] = {}

    def channel_for(program: int) -> int | None:
        ch = channels.get(program)
        if ch is None:
            if len(channels) >= 16:
                return None
            ch = len(channels)
            channels[program] = ch
            synth.program_select(ch, sfid, 0, int(program))
        return ch

    for bar in range(bars):
        for step_index, step_notes in enumerate(steps):
            offset = (bar * len(steps) + step_index) * step
            active: list[tuple[int, int]] = []
            for program, note, velocity in step_notes:
                if velocity <= 0:
                    continue
                ch = channel_for(program)
                if ch is None:
                    continue
                synth.noteon(ch, int(note), int(velocity * 127))
                active.append((ch, int(note)))
            seg = _to_array(synth.generate(step), step)
            out[offset : offset + step] += seg
            for ch, note in active:
                synth.noteoff(ch, note)

    # Let the final step's notes decay naturally.
    tail = _to_array(synth.generate(release), release)
    out[step * len(steps) * bars :] += tail

    peak = np.abs(out).max()
    if peak > 0:
        out = out / peak * 0.9
    return out.astype(np.float32)
