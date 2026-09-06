"""TTS voice enhancement — post-synthesis cleaner chain (Phase 1, DSP-only).

Runs after chunked generation and before loudness normalization. Chain order
is fixed: denoise -> de-ess -> warmth EQ -> dynamics. Every stage is
independently bypassable so the same function serves both the standalone
``POST /audio/voice-clean`` endpoint and the in-generation ``voice_clean``
flag.

No new dependencies: reuses DeepFilterNet-ONNX (when cached, otherwise
spectral subtraction), the existing de-esser / spectral denoiser, and the
existing compressor. All DSP is numpy-only. Gentle-by-default: every stage
targets the artifacts TTS engines leave behind (harsh sibilance, metallic
ring, flat pumping dynamics, buzzy breathiness) without dulling the voice.
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)

_PRESETS = {
    "light": {"denoise": True, "deesser": True, "warmth": True, "dynamics": False},
    "medium": {"denoise": True, "deesser": True, "warmth": True, "dynamics": True},
    "heavy": {"denoise": True, "deesser": True, "warmth": True, "dynamics": True},
}

# Per-engine default presets — lighter engines need less correction.
# Keys are engine names as they appear in GenerationContext.engine.
# Unlisted engines fall back to "medium".
ENGINE_PRESETS: dict[str, str] = {
    # Light: already clean output, minimal artifact removal
    "kitten-tts": "light",
    "kitten-tts-nano": "light",
    "kitten-tts-micro": "light",
    "kitten-tts-mini": "light",
    "kokoro": "light",
    "kokoro-onnx": "light",
    "moss-tts-nano": "light",
    "pocket-tts": "light",
    # Medium: balanced correction
    "styletts2": "medium",
    "styletts2-onnx": "medium",
    "neutts-air": "medium",
    # Heavy: most synthetic artifacts
    "parler-tts-mini": "heavy",
    "orpheus": "heavy",
}

_DEFAULTS = {"denoise": True, "deesser": True, "warmth": True, "dynamics": True}


def _resolve_params(params: dict | None, engine: str | None = None) -> dict:
    """Merge an optional params dict over the defaults (and an optional preset).

    When *engine* is provided and *params* does not specify a preset, the
    engine-specific default from ``ENGINE_PRESETS`` is used instead of the
    hard-coded "medium" baseline.
    """
    merged = dict(_DEFAULTS)
    if params:
        preset = params.get("preset")
        if preset in _PRESETS:
            merged.update(_PRESETS[preset])
        merged.update({k: v for k, v in params.items() if k not in ("preset", "engine")})
    elif engine:
        # No explicit params — use the engine-specific default
        engine_preset = ENGINE_PRESETS.get(engine, "medium")
        merged.update(_PRESETS[engine_preset])
    return merged


def _denoise(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Neural denoise when DeepFilterNet-ONNX is available and cached, else spectral."""
    from .deepfilter_onnx import _is_model_cached, clean_audio_onnx, is_onnx_available
    from .effects_extended import apply_spectral_denoise

    if is_onnx_available() and _is_model_cached():
        return clean_audio_onnx(audio, sample_rate)
    return apply_spectral_denoise(audio, sample_rate, {"amount": 0.5})


def _deess(audio: np.ndarray, sample_rate: int, strength: float) -> np.ndarray:
    """Gentle sibilance control: -18 dB band threshold, up to -6 dB reduction."""
    from .effects_extended import apply_deesser

    return apply_deesser(
        audio,
        sample_rate,
        {"threshold_db": -18.0, "reduction_db": -6.0, "strength": 0.6 * strength},
    )


def _warmth_eq(audio: np.ndarray, sample_rate: int, strength: float) -> np.ndarray:
    """Light tonal shaping: +1 dB low-mid shelf (~400 Hz) and -1.5 dB presence (3-6 kHz).

    Numpy-only FFT shelves with smooth transition ramps; the exact curve of a
    pair of gentle IIR shelves without pulling scipy into this path.
    """
    lowmid_db = 1.0 * strength
    presence_db = -1.5 * strength
    n = len(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.ones_like(freqs)

    lowmid = 10.0 ** (lowmid_db / 20.0)
    shelf_cutoff, shelf_width = 400.0, 300.0
    shelf = (freqs >= shelf_cutoff) & (freqs < shelf_cutoff + shelf_width)
    mask[freqs < shelf_cutoff] = lowmid
    t = (freqs[shelf] - shelf_cutoff) / shelf_width
    mask[shelf] = 1.0 + (lowmid - 1.0) * (1.0 - t)

    presence = 10.0 ** (presence_db / 20.0)
    band_low, band_high = 3000.0, 6000.0
    edge = 400.0
    dip = (freqs >= band_low) & (freqs < band_high)
    mask[dip] = presence
    low_edge = (freqs >= band_low - edge) & (freqs < band_low)
    te = (freqs[low_edge] - (band_low - edge)) / edge
    mask[low_edge] = 1.0 + (presence - 1.0) * te
    high_edge = (freqs >= band_high) & (freqs < band_high + edge)
    te = (freqs[high_edge] - band_high) / edge
    mask[high_edge] = 1.0 + (presence - 1.0) * (1.0 - te)

    spectrum = np.fft.rfft(audio) * mask
    return np.fft.irfft(spectrum, n=n).astype(np.float32)


def _dynamics(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Light glue compression: 2:1 at -24 dB, fast attack, slow release."""
    from .effects import apply_compressor

    return apply_compressor(
        audio,
        sample_rate,
        {"threshold": -24.0, "ratio": 2.0, "attack": 0.005, "release": 0.15},
    )


def enhance_tts(
    audio: np.ndarray,
    sample_rate: int,
    params: dict | None = None,
    *,
    engine: str | None = None,
) -> np.ndarray:
    """Apply the voice-clean chain: denoise -> de-ess -> warmth -> dynamics.

    ``params`` accepts ``preset`` ("light"|"medium"|"heavy") and per-stage
    booleans (``denoise``, ``deesser``, ``warmth``, ``dynamics``) plus an
    overall ``strength`` in [0, 1] that scales the de-ess and EQ gains.

    When *engine* is given and *params* omits ``preset``, the engine-specific
    default from ``ENGINE_PRESETS`` is used automatically.
    """
    if audio.size == 0:
        return audio
    merged = _resolve_params(params, engine=engine)
    strength = min(max(float(merged.get("strength", 1.0)), 0.0), 1.0)
    if audio.dtype != np.float32:
        audio = audio.astype(np.float32)

    if merged.get("denoise"):
        try:
            audio = _denoise(audio, sample_rate)
        except Exception as exc:
            logger.debug("TTS enhancer denoise skipped (%s)", exc)

    if merged.get("deesser"):
        try:
            audio = _deess(audio, sample_rate, strength)
        except Exception as exc:
            logger.debug("TTS enhancer de-ess skipped (%s)", exc)

    if merged.get("warmth"):
        try:
            audio = _warmth_eq(audio, sample_rate, strength)
        except Exception as exc:
            logger.debug("TTS enhancer warmth EQ skipped (%s)", exc)

    if merged.get("dynamics"):
        try:
            audio = _dynamics(audio, sample_rate)
        except Exception as exc:
            logger.debug("TTS enhancer dynamics skipped (%s)", exc)

    return np.clip(audio, -1.0, 1.0)
