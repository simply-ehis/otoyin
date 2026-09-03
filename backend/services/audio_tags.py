"""Universal audio tag system — works on any TTS engine.

Parses bracketed tags like [pause], [laughs shy], [sigh] from input text,
loads real human recordings from the sample library, strips tags from text,
then splices everything back together. The TTS engine never sees the tags.

Audio source priority:
  1. Sample library (data/vocal_samples/) — real human recordings
  2. DSP synthesis — fallback for pauses, speech modifiers, missing classes

Tag format:
  [tag]                  — simple tag
  [tag modifier1 ...]    — compound tag with modifiers

Supported tags:
  Family A (vocal, samples):  [laughs], [chuckles], [giggles], [hmmm], [sigh], [cough], [yawn], [gulps], [umm], [uhh]
  Family B (mechanical, DSP): [pause], [breath], [breaths], [gasp], [tsk]
  Speech modifiers:           [whisper], [shout]

Modifiers: shy, quickly, slowly, nervously, thoughtfully, softly, loudly, deep

To replace starter samples with real human recordings:
  python -m backend.scripts.curate_vocal_samples --per-tag 10
"""

from __future__ import annotations

import logging
from collections.abc import Callable

import numpy as np

from .audio_tags_synth import (
    _MODIFIER_EFFECTS,
    _TAG_DURATIONS,
    _TAG_RE,
    ParsedTag,
    SynthParams,
    TextSegment,
    gen_breath,
    gen_cough,
    gen_gasp,
    gen_gulps,
    gen_hmmm,
    gen_laugh,
    gen_pause,
    gen_sigh,
    gen_tsk,
    gen_uhm,
    gen_yawn,
    normalize,
    resolve_duration,
    resolve_params,
)

logger = logging.getLogger(__name__)

# Expose ParsedTag at module level for external callers
__all__ = [
    "ParsedTag",
    "SynthParams",
    "TextSegment",
    "apply_audio_tags",
    "apply_emotion_dsp",
    "engine_supports_native_tags",
    "generate_tag_audio",
    "get_clean_text_segments",
    "get_native_tag_info",
    "list_emotion_presets",
    "list_supported_tags",
    "parse_tags",
    "strip_tags",
    "to_native_tag",
]


# ─── Emotion → DSP presets (Tier 1: training-free) ───────────────────────────
EMOTION_PRESETS: dict[str, dict[str, float]] = {
    "happy": {"pitch_mult": 1.08, "energy_mult": 0.85, "rate_mult": 1.05, "jitter": 0.03, "brightness": 1.1},
    "sad": {"pitch_mult": 0.92, "energy_mult": 0.45, "rate_mult": 0.90, "jitter": 0.05, "brightness": 0.85},
    "angry": {"pitch_mult": 1.12, "energy_mult": 1.0, "rate_mult": 1.10, "jitter": 0.08, "brightness": 1.2},
    "calm": {"pitch_mult": 0.97, "energy_mult": 0.50, "rate_mult": 0.95, "jitter": 0.02, "brightness": 0.9},
    "excited": {"pitch_mult": 1.15, "energy_mult": 0.95, "rate_mult": 1.15, "jitter": 0.06, "brightness": 1.15},
    "fearful": {"pitch_mult": 1.10, "energy_mult": 0.70, "rate_mult": 1.08, "jitter": 0.20, "brightness": 1.05},
    "surprised": {"pitch_mult": 1.18, "energy_mult": 0.90, "rate_mult": 1.12, "jitter": 0.12, "brightness": 1.25},
    "disgusted": {"pitch_mult": 0.95, "energy_mult": 0.60, "rate_mult": 0.88, "jitter": 0.10, "brightness": 0.8},
    "neutral": {"pitch_mult": 1.0, "energy_mult": 0.65, "rate_mult": 1.0, "jitter": 0.02, "brightness": 1.0},
    "whisper": {"pitch_mult": 1.0, "energy_mult": 0.20, "rate_mult": 0.95, "jitter": 0.08, "brightness": 0.7},
    "shout": {"pitch_mult": 1.05, "energy_mult": 1.0, "rate_mult": 1.05, "jitter": 0.04, "brightness": 1.3},
}

# Engines that support native paralinguistic tags
NATIVE_TAG_ENGINES: dict[str, set[str]] = {
    "chattts": {
        "[laugh]",
        "[cough]",
        "[uh]",
        "[um]",
        "[noise]",
        "[warning]",
        "[applause]",
        "[laughter]",
        "[music]",
        "[ring]",
    },
    "zonos": {
        "[angry]",
        "[happy]",
        "[sad]",
        "[fearful]",
        "[surprised]",
        "[whisper]",
        "[shout]",
        "[laugh]",
        "[cry]",
        "[excited]",
    },
    "orpheus": {"<laugh>", "<sigh>", "<cough>", "<sniffle>", "<groan>", "<yawn>", "<gasp>"},
}

# Map our tag names to native tag format per engine
_TAG_NATIVE_MAP: dict[str, dict[str, str]] = {
    "chattts": {
        "laughs": "[laugh]",
        "laugh": "[laugh]",
        "cough": "[cough]",
        "umm": "[um]",
        "uhh": "[uh]",
    },
    "zonos": {
        "laughs": "[laugh]",
        "laugh": "[laugh]",
    },
    "orpheus": {
        "laughs": "<laugh>",
        "laugh": "<laugh>",
        "sigh": "<sigh>",
        "cough": "<cough>",
        "yawn": "<yawn>",
        "gasp": "<gasp>",
    },
}


def engine_supports_native_tags(engine: str) -> bool:
    """Check if an engine handles paralinguistic tags natively."""
    return engine in NATIVE_TAG_ENGINES


def to_native_tag(tag_name: str, engine: str) -> str | None:
    """Convert our tag name to the engine's native tag format, or None if unsupported."""
    mapping = _TAG_NATIVE_MAP.get(engine, {})
    return mapping.get(tag_name)


# ─── Parsing ──────────────────────────────────────────────────────────────────


def parse_tags(text: str) -> list[TextSegment]:
    segments: list[TextSegment] = []
    last_end = 0
    for match in _TAG_RE.finditer(text):
        if match.start() > last_end:
            segments.append(TextSegment(text=text[last_end : match.start()]))
        raw_text = match.group(0)
        raw = match.group(1).strip().lower()
        parts = raw.split()
        tag_name = parts[0]
        modifiers = parts[1:] if len(parts) > 1 else []
        segments.append(
            TextSegment(
                tag=ParsedTag(tag=tag_name, modifiers=modifiers, raw=raw_text),
                is_tag=True,
                raw=raw_text,
            )
        )
        last_end = match.end()
    if last_end < len(text):
        segments.append(TextSegment(text=text[last_end:]))
    return segments


def strip_tags(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def get_clean_text_segments(text: str) -> list[str]:
    segments = parse_tags(text)
    return [s.text.strip() for s in segments if s.text and s.text.strip()]


# ─── Dispatch ─────────────────────────────────────────────────────────────────


def generate_tag_audio(tag: ParsedTag, sample_rate: int = 24000) -> np.ndarray:
    """Generate audio for a single parsed tag.

    Priority:
    1. Sample library (real human recordings)
    2. DSP synthesis (pauses, speech modifiers, fallback)
    """
    from .audio_sample_library import apply_modifier, get_library, load_sample_audio

    base = tag.tag
    sr = sample_rate

    # Pauses and speech modifiers — always DSP
    if base in ("pause", "short pause", "long pause"):
        return gen_pause(resolve_duration(tag), sr)
    if base in ("whisper", "shout"):
        return gen_pause(0.0, sr)

    # Try sample library first
    lib = get_library()
    if lib.has_tag(base):
        variant = _pick_variant(tag)
        sample = lib.get_sample(base, variant)
        if sample is not None:
            audio = load_sample_audio(sample, sr)
            if tag.modifiers:
                audio = apply_modifier(audio, tag.modifiers, sr)
            return audio

    # DSP fallback for tags without samples
    params = resolve_params(tag)

    if base in ("breath", "breaths"):
        return gen_breath(resolve_duration(tag), sr, params)
    if base == "gasp":
        return gen_gasp(resolve_duration(tag), sr, params)
    if base == "tsk":
        return gen_tsk(resolve_duration(tag), sr, params)
    if base in ("laughs", "chuckles", "giggles"):
        style = {"laughs": "laugh", "chuckles": "chuckle", "giggles": "giggle"}[base]
        return gen_laugh(resolve_duration(tag), sr, params, style)
    if base == "hmmm":
        return gen_hmmm(resolve_duration(tag), sr, params)
    if base == "sigh":
        return gen_sigh(resolve_duration(tag), sr, params)
    if base == "cough":
        return gen_cough(resolve_duration(tag), sr, params)
    if base == "yawn":
        return gen_yawn(resolve_duration(tag), sr, params)
    if base == "gulps":
        return gen_gulps(resolve_duration(tag), sr, params)
    if base in ("umm", "uhh"):
        return gen_uhm(resolve_duration(tag), sr, params, base)

    return gen_pause(max(resolve_duration(tag), 200.0), sr)


def _pick_variant(tag: ParsedTag) -> str:
    """Determine which sample variant to use based on modifiers."""
    mods = set(tag.modifiers) if tag.modifiers else set()
    if mods & {"loudly", "shout"}:
        return "loud"
    if mods & {"softly", "shy"}:
        return "soft"
    return "normal"


# ─── Main entry point ────────────────────────────────────────────────────────


async def apply_audio_tags(
    text: str,
    tts_fn: Callable,
    sample_rate: int = 24000,
    crossfade_ms: float = 20.0,
    engine: str = "",
) -> tuple[np.ndarray, int]:
    """Apply audio tags to text using any TTS function.

    If *engine* supports native paralinguistic tags, tags are converted to
    the engine's native format and passed through — no DSP synthesis.
    """
    segments = parse_tags(text)
    if not segments:
        return np.array([], dtype=np.float32), sample_rate

    has_tags = any(s.is_tag for s in segments)
    if not has_tags:
        clean = text.strip()
        if not clean:
            return np.array([], dtype=np.float32), sample_rate
        audio, sr = await tts_fn(clean, sample_rate)
        return audio, sr

    # Fast path: engine handles tags natively — rewrite them and send the
    # full text to TTS in one call (no split/concat/crossfade).
    if engine and engine_supports_native_tags(engine):
        rewritten = text
        for seg in segments:
            if seg.is_tag and seg.tag is not None:
                native = to_native_tag(seg.tag.tag, engine)
                if native:
                    rewritten = rewritten.replace(seg.raw, native, 1)
        # Strip any tags the engine doesn't understand
        for seg in segments:
            if seg.is_tag and seg.tag is not None:
                native = to_native_tag(seg.tag.tag, engine)
                if not native:
                    rewritten = rewritten.replace(seg.raw, "", 1)
        clean = " ".join(rewritten.split())
        if not clean:
            return np.array([], dtype=np.float32), sample_rate
        audio, sr = await tts_fn(clean, sample_rate)
        return audio, sr

    # Slow path: synthesize each tag via DSP, concatenate with crossfade.
    audio_parts: list[np.ndarray] = []
    for segment in segments:
        if segment.is_tag and segment.tag is not None:
            audio_parts.append(generate_tag_audio(segment.tag, sample_rate))
        elif segment.text is not None:
            clean_text = segment.text.strip()
            if clean_text:
                audio, sr = await tts_fn(clean_text, sample_rate)
                if sr != sample_rate:
                    from scipy.signal import resample

                    audio = resample(audio, int(len(audio) * sample_rate / sr))
                audio_parts.append(audio.astype(np.float32))

    if not audio_parts:
        return np.array([], dtype=np.float32), sample_rate

    if crossfade_ms <= 0 or len(audio_parts) < 2:
        result = np.concatenate(audio_parts)
    else:
        result = audio_parts[0]
        cf_samples = int(sample_rate * crossfade_ms / 1000.0)
        for part in audio_parts[1:]:
            if len(part) == 0:
                continue
            cf = min(cf_samples, len(result), len(part))
            if cf > 0:
                t = np.linspace(0.0, 1.0, cf, dtype=np.float32)
                cross = result[-cf:] * np.cos(t * np.pi / 2) + part[:cf] * np.sin(t * np.pi / 2)
                result = np.concatenate([result[:-cf], cross, part[cf:]])
            else:
                result = np.concatenate([result, part])

    return np.clip(normalize(result), -1.0, 1.0).astype(np.float32), sample_rate


def list_supported_tags() -> dict[str, dict]:
    """Return all supported tags with their default durations and modifiers."""
    tags = {}
    for name, (base_ms, variance) in _TAG_DURATIONS.items():
        tags[name] = {
            "base_duration_ms": base_ms,
            "variance_ms": variance,
            "modifiers": list(_MODIFIER_EFFECTS.keys()),
        }
    return tags


def get_native_tag_info() -> dict[str, list[str]]:
    """Return which engines support native tags and what they accept."""
    return {engine: sorted(tags) for engine, tags in NATIVE_TAG_ENGINES.items()}


# ─── Emotion DSP post-processing ──────────────────────────────────────────────


def apply_emotion_dsp(
    audio: np.ndarray,
    sample_rate: int,
    emotion: str,
) -> np.ndarray:
    """Apply emotion DSP preset to audio.

    This is a lightweight post-processing pass that shifts pitch, energy,
    rate, and jitter to approximate an emotional tone.  It does NOT require
    training — it's purely DSP-based (Tier 1).

    Parameters
    ----------
    audio : np.ndarray
        Input audio (float32, mono).
    sample_rate : int
        Sample rate in Hz.
    emotion : str
        Emotion label (e.g. "happy", "sad", "angry").

    Returns
    -------
    np.ndarray
        Emotion-shifted audio.
    """
    preset = EMOTION_PRESETS.get(emotion.lower().strip())
    if preset is None:
        return audio

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    result = audio.copy()

    # 1. Pitch shift (via resampling)
    pitch_mult = preset.get("pitch_mult", 1.0)
    if abs(pitch_mult - 1.0) > 0.01:
        try:
            import scipy.signal

            num_samples = int(len(result) / pitch_mult)
            result = scipy.signal.resample(result, num_samples).astype(np.float32)
        except Exception:
            logger.debug("Pitch shift unavailable", exc_info=True)

    # 2. Energy/amplitude scaling
    energy_mult = preset.get("energy_mult", 0.65)
    target_rms = energy_mult * 0.15  # Target RMS level
    current_rms = float(np.sqrt(np.mean(result**2)))
    if current_rms > 1e-6:
        result = result * (target_rms / current_rms)
    result = np.clip(result, -0.95, 0.95)

    # 3. Jitter injection (cycle-to-cycle pitch perturbation)
    jitter = preset.get("jitter", 0.02)
    if jitter > 0.01:
        rng = np.random.default_rng()
        n = len(result)
        jitter_env = 1.0 + jitter * rng.standard_normal(n).astype(np.float32)
        result = result * jitter_env

    # 4. Brightness (simple high-shelf filter)
    brightness = preset.get("brightness", 1.0)
    if abs(brightness - 1.0) > 0.05:
        try:
            from scipy.signal import butter, sosfilt

            cutoff = 2000.0
            nyq = sample_rate / 2.0
            if cutoff < nyq:
                # High shelf: boost or cut above cutoff
                gain_db = 3.0 * (brightness - 1.0)
                gain_lin = 10 ** (gain_db / 20.0)
                sos = butter(1, cutoff, btype="high", fs=sample_rate, output="sos")
                high_part = sosfilt(sos, result)
                result = result + (gain_lin - 1.0) * high_part
        except Exception:
            logger.debug("Brightness filter unavailable", exc_info=True)

    return np.clip(result, -0.95, 0.95).astype(np.float32)


def list_emotion_presets() -> dict[str, dict[str, float]]:
    """Return all available emotion presets with their parameters."""
    return dict(EMOTION_PRESETS)
