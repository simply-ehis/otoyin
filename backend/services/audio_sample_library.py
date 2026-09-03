"""Sample library for vocal burst tags — real human recordings.

Replaces source-filter synthesis with curated samples from LAION Vocal Bursts
Clean and similar open datasets. Each tag maps to a folder of pre-recorded WAV
variants (normal, soft, loud). Modifiers are applied via pitch/time stretching
at runtime when pre-recorded variants don't cover the request.

Tag → LAION class mapping:
  LAION has 68 fine-grained classes (2.28M clips, 284h).
  We map our 19 tag types to the best-matching LAION classes.
"""

from __future__ import annotations

import logging
import os
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# ─── Tag → LAION class mapping ────────────────────────────────────────────────

# Each tag maps to a list of LAION classes ordered by preference.
# The curation script picks the best N samples from these classes.
TAG_CLASS_MAP: dict[str, list[str]] = {
    "laughs": ["Chuckle", "Breathy Giggle", "Snorting Giggle", "Cackle"],
    "chuckles": ["Chuckle", "Snicker"],
    "giggles": ["Breathy Giggle", "Snorting Giggle"],
    "sigh": ["Wistful Sigh", "Relief Sigh", "Exasperated Sigh", "Contented Sigh"],
    "cough": ["Cough"],
    "yawn": ["Yawn"],
    "gasp": ["Surprised Gasp", "Fearful Gasp"],
    "gulps": ["Gulps", "Nervous Gulp"],
    "tsk": ["Tsk", "Tongue Click"],
    "hmmm": ["Purr"],
    "umm": ["Affirmative Grunt"],
    "uhh": ["Displeased Grunt"],
    "breath": ["Sharp Inhale"],
    "breaths": ["Sharp Inhale"],
}

# Tags that stay as DSP (no samples needed)
DSP_ONLY_TAGS = {"pause", "short pause", "long pause", "whisper", "shout"}

# Sample variants we curate per tag
VARIANTS = ("normal", "soft", "loud")


@dataclass
class SampleEntry:
    """One curated sample file."""

    path: Path
    tag: str
    variant: str  # "normal", "soft", or "loud"
    duration_ms: float
    rms: float  # loudness for variant selection


@dataclass
class SampleLibrary:
    """Indexed collection of curated vocal samples."""

    root: Path
    samples: dict[str, list[SampleEntry]]  # tag → entries
    _loaded: bool = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def available_tags(self) -> list[str]:
        """Tags that have at least one sample."""
        return sorted(t for t, s in self.samples.items() if s)

    def has_tag(self, tag: str) -> bool:
        return bool(self.samples.get(tag))

    def get_sample(self, tag: str, variant: str = "normal") -> SampleEntry | None:
        """Get a random sample for the tag and variant.

        Falls back: loud→normal→soft→any.
        """
        entries = self.samples.get(tag, [])
        if not entries:
            return None

        # Try exact variant
        candidates = [e for e in entries if e.variant == variant]
        if candidates:
            return random.choice(candidates)

        # Fallback chain
        for fallback in ("normal", "soft", "loud"):
            candidates = [e for e in entries if e.variant == fallback]
            if candidates:
                return random.choice(candidates)

        # Any sample
        return random.choice(entries)


# ─── Library loading ──────────────────────────────────────────────────────────

_LIBRARY: SampleLibrary | None = None
_LIBRARY_ROOT: Path | None = None


def _find_library_root() -> Path:
    """Find the vocal samples directory."""
    # Check environment variable first
    env_path = os.environ.get("VOCAL_SAMPLES_DIR")
    if env_path:
        return Path(env_path)

    # Check relative to this file
    here = Path(__file__).resolve().parent
    candidate = here.parent.parent / "data" / "vocal_samples"
    if candidate.is_dir():
        return candidate

    # Check project root
    project_root = here.parent.parent.parent
    candidate = project_root / "data" / "vocal_samples"
    if candidate.is_dir():
        return candidate

    # Return default even if not exist yet
    return here.parent.parent / "data" / "vocal_samples"


def load_library(force: bool = False) -> SampleLibrary:
    """Load (or reload) the vocal sample library from disk.

    Scans data/vocal_samples/<tag>/<variant>/*.wav and indexes them.
    """
    global _LIBRARY, _LIBRARY_ROOT

    if _LIBRARY is not None and not force:
        return _LIBRARY

    root = _find_library_root()
    _LIBRARY_ROOT = root
    samples: dict[str, list[SampleEntry]] = {}

    if not root.is_dir():
        logger.warning("Vocal sample library not found at %s", root)
        _LIBRARY = SampleLibrary(root=root, samples=samples, _loaded=True)
        return _LIBRARY

    wav_count = 0
    for tag_dir in sorted(root.iterdir()):
        if not tag_dir.is_dir():
            continue
        tag = tag_dir.name
        entries: list[SampleEntry] = []

        for variant_dir in sorted(tag_dir.iterdir()):
            if not variant_dir.is_dir():
                continue
            variant = variant_dir.name
            if variant not in VARIANTS:
                continue

            for wav_file in sorted(variant_dir.glob("*.wav")):
                try:
                    import soundfile as sf

                    info = sf.info(str(wav_file))
                    duration_ms = info.duration * 1000.0

                    # Compute RMS for loudness-based variant selection
                    data, _sr = sf.read(str(wav_file), dtype="float32")
                    if data.ndim > 1:
                        data = data[:, 0]
                    rms = float(np.sqrt(np.mean(data**2)))

                    entries.append(
                        SampleEntry(
                            path=wav_file,
                            tag=tag,
                            variant=variant,
                            duration_ms=duration_ms,
                            rms=rms,
                        )
                    )
                    wav_count += 1
                except Exception as e:
                    logger.warning("Failed to load %s: %s", wav_file, e)

        samples[tag] = entries

    _LIBRARY = SampleLibrary(root=root, samples=samples, _loaded=True)
    logger.info("Loaded %d vocal samples for %d tags from %s", wav_count, len(samples), root)
    return _LIBRARY


def get_library() -> SampleLibrary:
    """Get the loaded library, loading if needed."""
    if _LIBRARY is None:
        return load_library()
    return _LIBRARY


# ─── Audio processing ─────────────────────────────────────────────────────────


def load_sample_audio(entry: SampleEntry, target_sr: int = 24000) -> np.ndarray:
    """Load a sample WAV file and resample to target sample rate."""
    import soundfile as sf
    from scipy.signal import resample

    data, sr = sf.read(str(entry.path), dtype="float32")
    if data.ndim > 1:
        data = data[:, 0]

    if sr != target_sr:
        n_samples = int(len(data) * target_sr / sr)
        data = resample(data, n_samples).astype(np.float32)

    return data


def apply_modifier(
    audio: np.ndarray,
    modifiers: list[str],
    sr: int = 24000,
) -> np.ndarray:
    """Apply modifier effects to a sample via DSP.

    Pre-recorded variants handle the main soft/loud distinction.
    This handles the finer-grained modifiers: shy, quickly, slowly, etc.
    """
    if not modifiers:
        return audio

    from scipy.signal import resample as scipy_resample

    result = audio.copy()

    for mod in modifiers:
        if mod == "shy":
            # Quieter, slightly higher pitch
            result *= 0.6
            result = _pitch_shift(result, sr, semitones=1.0)
        elif mod in ("quickly", "quick"):
            # 70% duration (speed up)
            n_out = int(len(result) * 0.7)
            result = scipy_resample(result, n_out).astype(np.float32)
        elif mod == "slowly":
            # 130% duration (slow down)
            n_out = int(len(result) * 1.3)
            result = scipy_resample(result, n_out).astype(np.float32)
        elif mod == "nervously":
            # Shorter, slightly higher pitch, quieter
            n_out = int(len(result) * 0.8)
            result = scipy_resample(result, n_out).astype(np.float32)
            result = _pitch_shift(result, sr, semitones=1.5)
            result *= 0.7
        elif mod == "thoughtfully":
            # Longer, slightly lower pitch
            n_out = int(len(result) * 1.2)
            result = scipy_resample(result, n_out).astype(np.float32)
            result = _pitch_shift(result, sr, semitones=-1.0)
        elif mod == "softly":
            result *= 0.4
        elif mod == "loudly":
            result *= 1.5
        elif mod == "deep":
            # Lower pitch, longer
            result = _pitch_shift(result, sr, semitones=-2.0)
            n_out = int(len(result) * 1.15)
            result = scipy_resample(result, n_out).astype(np.float32)

    return np.clip(result, -1.0, 1.0).astype(np.float32)


def _pitch_shift(audio: np.ndarray, sr: int, semitones: float) -> np.ndarray:
    """Simple pitch shift via resampling (no phase vocoder — good enough for
    short non-speech sounds)."""
    from scipy.signal import resample as scipy_resample

    factor = 2.0 ** (semitones / 12.0)
    n_out = int(len(audio) / factor)
    if n_out < 1:
        return audio
    shifted = scipy_resample(audio, n_out).astype(np.float32)

    # Trim or pad to original length
    if len(shifted) > len(audio):
        shifted = shifted[: len(audio)]
    elif len(shifted) < len(audio):
        shifted = np.pad(shifted, (0, len(audio) - len(shifted)))

    return shifted


# ─── Manifest for frontend ────────────────────────────────────────────────────


def get_manifest() -> dict[str, dict]:
    """Return a manifest of available samples for the frontend.

    Returns:
        {tag: {variants: [...], count: N, has_samples: True}}
    """
    lib = get_library()
    manifest: dict[str, dict] = {}

    for tag in sorted(set(list(TAG_CLASS_MAP.keys()) + list(DSP_ONLY_TAGS))):
        entries = lib.samples.get(tag, [])
        variants = sorted(set(e.variant for e in entries))
        manifest[tag] = {
            "has_samples": bool(entries),
            "count": len(entries),
            "variants": variants,
            "is_dsp": tag in DSP_ONLY_TAGS,
            "laion_classes": TAG_CLASS_MAP.get(tag, []),
        }

    return manifest
