"""
Audio post-processing effects engine.

Uses Spotify's pedalboard library to apply professional-grade DSP effects
to generated audio. Effects are described as a JSON-serializable chain
(list of effect dicts) so they can be stored in the database and sent
over the API.

Supported effect types:
  - chorus      (flanger-style with short delays)
  - reverb      (room reverb)
  - delay       (echo / delay line)
  - compressor  (dynamic range compression)
  - gain        (volume adjustment in dB)
  - highpass     (high-pass filter)
  - lowpass      (low-pass filter)
  - pitch_shift (semitone pitch shifting)
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

try:
    from pedalboard import (
        Chorus,
        Compressor,
        Delay,
        Gain,
        HighpassFilter,
        LowpassFilter,
        Pedalboard,
        PitchShift,
        Reverb,
    )

    _PEDALBOARD_AVAILABLE = True
except ImportError:
    _PEDALBOARD_AVAILABLE = False
    logger.debug("pedalboard not installed — audio effects unavailable")

# Each param definition: (default, min, max, description)
EFFECT_REGISTRY: dict[str, dict[str, Any]] = {
    "chorus": {
        "cls": Chorus,
        "label": "Chorus / Flanger",
        "description": "Modulated delay for flanging or chorus effects. Short centre_delay_ms (<10) gives flanger; longer gives chorus.",
        "params": {
            "rate_hz": {"default": 1.0, "min": 0.01, "max": 20.0, "step": 0.01, "description": "LFO speed (Hz)"},
            "depth": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Modulation depth"},
            "feedback": {"default": 0.0, "min": 0.0, "max": 0.95, "step": 0.01, "description": "Feedback amount"},
            "centre_delay_ms": {
                "default": 7.0,
                "min": 0.5,
                "max": 50.0,
                "step": 0.1,
                "description": "Centre delay (ms)",
            },
            "mix": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Wet/dry mix"},
        },
    },
    "reverb": {
        "cls": Reverb,
        "label": "Reverb",
        "description": "Room reverb effect.",
        "params": {
            "room_size": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Room size"},
            "damping": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "High frequency damping"},
            "wet_level": {"default": 0.33, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Wet level"},
            "dry_level": {"default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Dry level"},
            "width": {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Stereo width"},
        },
    },
    "delay": {
        "cls": Delay,
        "label": "Delay",
        "description": "Echo / delay line.",
        "params": {
            "delay_seconds": {
                "default": 0.3,
                "min": 0.01,
                "max": 2.0,
                "step": 0.01,
                "description": "Delay time (seconds)",
            },
            "feedback": {"default": 0.3, "min": 0.0, "max": 0.95, "step": 0.01, "description": "Feedback amount"},
            "mix": {"default": 0.3, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Wet/dry mix"},
        },
    },
    "compressor": {
        "cls": Compressor,
        "label": "Compressor",
        "description": "Dynamic range compression for consistent loudness.",
        "params": {
            "threshold_db": {"default": -20.0, "min": -60.0, "max": 0.0, "step": 0.5, "description": "Threshold (dB)"},
            "ratio": {"default": 4.0, "min": 1.0, "max": 20.0, "step": 0.1, "description": "Compression ratio"},
            "attack_ms": {"default": 10.0, "min": 0.1, "max": 100.0, "step": 0.1, "description": "Attack time (ms)"},
            "release_ms": {
                "default": 100.0,
                "min": 10.0,
                "max": 1000.0,
                "step": 1.0,
                "description": "Release time (ms)",
            },
        },
    },
    "gain": {
        "cls": Gain,
        "label": "Gain",
        "description": "Volume adjustment in decibels.",
        "params": {
            "gain_db": {"default": 0.0, "min": -40.0, "max": 40.0, "step": 0.5, "description": "Gain (dB)"},
        },
    },
    "highpass": {
        "cls": HighpassFilter,
        "label": "High-Pass Filter",
        "description": "Removes frequencies below the cutoff.",
        "params": {
            "cutoff_frequency_hz": {
                "default": 80.0,
                "min": 20.0,
                "max": 8000.0,
                "step": 1.0,
                "description": "Cutoff frequency (Hz)",
            },
        },
    },
    "lowpass": {
        "cls": LowpassFilter,
        "label": "Low-Pass Filter",
        "description": "Removes frequencies above the cutoff.",
        "params": {
            "cutoff_frequency_hz": {
                "default": 8000.0,
                "min": 200.0,
                "max": 20000.0,
                "step": 1.0,
                "description": "Cutoff frequency (Hz)",
            },
        },
    },
    "pitch_shift": {
        "cls": PitchShift,
        "label": "Pitch Shift",
        "description": "Shift pitch up or down by semitones.",
        "params": {
            "semitones": {"default": 0.0, "min": -12.0, "max": 12.0, "step": 0.5, "description": "Semitones to shift"},
        },
    },
    "gender_swap": {
        "cls": PitchShift,
        "label": "Gender Swap",
        "description": "Gender swap using pitch and formant shifting.",
        "params": {
            "amount": {
                "default": 0.0,
                "min": -1.0,
                "max": 1.0,
                "step": 0.01,
                "description": "Swap amount (-1=male, 1=female)",
            },
        },
    },
    "age_shift": {
        "cls": PitchShift,
        "label": "Age Shift",
        "description": "Shift perceived age of voice.",
        "params": {
            "amount": {
                "default": 0.0,
                "min": -1.0,
                "max": 1.0,
                "step": 0.01,
                "description": "Shift amount (-1=younger, 1=older)",
            },
        },
    },
    "helium": {
        "cls": PitchShift,
        "label": "Helium",
        "description": "Helium voice effect.",
        "params": {
            "intensity": {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Effect intensity"},
        },
    },
    "vocoder": {
        "cls": Chorus,
        "label": "Robot Vocoder",
        "description": "Robotic vocoder effect using amplitude modulation.",
        "params": {
            "rate_hz": {"default": 100.0, "min": 20.0, "max": 500.0, "step": 1.0, "description": "Carrier rate (Hz)"},
            "depth": {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Modulation depth"},
            "mix": {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Wet/dry mix"},
        },
    },
    "telephone": {
        "cls": HighpassFilter,
        "label": "Telephone/Radio",
        "description": "Telephone or radio bandpass effect.",
        "params": {
            "low_cutoff": {
                "default": 300.0,
                "min": 100.0,
                "max": 1000.0,
                "step": 10.0,
                "description": "Low cutoff (Hz)",
            },
            "high_cutoff": {
                "default": 3500.0,
                "min": 1000.0,
                "max": 8000.0,
                "step": 10.0,
                "description": "High cutoff (Hz)",
            },
            "compression": {"default": 6.0, "min": 1.0, "max": 20.0, "step": 0.5, "description": "Compression ratio"},
            "gain_db": {"default": 6.0, "min": 0.0, "max": 20.0, "step": 0.5, "description": "Output gain (dB)"},
        },
    },
    "megaphone": {
        "cls": Chorus,
        "label": "Megaphone",
        "description": "Megaphone effect with distortion and bandpass.",
        "params": {
            "distortion_gain": {"default": 4.0, "min": 1.0, "max": 10.0, "step": 0.1, "description": "Distortion gain"},
            "low_cutoff": {
                "default": 400.0,
                "min": 200.0,
                "max": 1000.0,
                "step": 10.0,
                "description": "Low cutoff (Hz)",
            },
            "high_cutoff": {
                "default": 2500.0,
                "min": 1000.0,
                "max": 5000.0,
                "step": 10.0,
                "description": "High cutoff (Hz)",
            },
        },
    },
    "underwater": {
        "cls": Reverb,
        "label": "Underwater",
        "description": "Underwater effect with lowpass and reverb.",
        "params": {
            "cutoff": {
                "default": 800.0,
                "min": 200.0,
                "max": 2000.0,
                "step": 10.0,
                "description": "Filter cutoff (Hz)",
            },
            "reverb_amount": {"default": 0.6, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Reverb amount"},
            "tremolo_rate": {"default": 3.0, "min": 0.5, "max": 10.0, "step": 0.1, "description": "Tremolo rate (Hz)"},
            "tremolo_depth": {"default": 0.4, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Tremolo depth"},
        },
    },
    "whisper_transform": {
        "cls": PitchShift,
        "label": "Whisper Transform",
        "description": "Whisper transform removing fundamental and enhancing breathiness.",
        "params": {
            "breathiness": {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Breathiness amount"},
            "pitch_factor": {"default": 1.2, "min": 0.8, "max": 1.5, "step": 0.01, "description": "Pitch scaling"},
        },
    },
    "auto_tune": {
        "cls": PitchShift,
        "label": "Auto-Tune",
        "description": "One-tap pitch correction, scale-aware.",
        "params": {
            "speed": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Correction speed"},
            "strength": {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Correction strength"},
        },
    },
    "spectral_duck": {
        "cls": Compressor,
        "label": "Spectral Ducking",
        "description": "Dynamic EQ sidechaining — carve voice frequencies from background.",
        "params": {
            "duck_amount_db": {
                "default": -12.0,
                "min": -30.0,
                "max": 0.0,
                "step": 0.5,
                "description": "Duck amount (dB)",
            },
            "freq_low": {
                "default": 200.0,
                "min": 50.0,
                "max": 500.0,
                "step": 10.0,
                "description": "Voice band low (Hz)",
            },
            "freq_high": {
                "default": 4000.0,
                "min": 1000.0,
                "max": 8000.0,
                "step": 100.0,
                "description": "Voice band high (Hz)",
            },
            "threshold": {"default": -30.0, "min": -60.0, "max": 0.0, "step": 0.5, "description": "Threshold (dB)"},
        },
    },
    "multi_band_pitch": {
        "cls": PitchShift,
        "label": "Multi-Band Pitch Shifter",
        "description": "Isolate and shift tones within distinct frequency bands.",
        "params": {
            "low_semitones": {
                "default": 0.0,
                "min": -12.0,
                "max": 12.0,
                "step": 0.5,
                "description": "Low band pitch shift",
            },
            "mid_semitones": {
                "default": 0.0,
                "min": -12.0,
                "max": 12.0,
                "step": 0.5,
                "description": "Mid band pitch shift",
            },
            "high_semitones": {
                "default": 0.0,
                "min": -12.0,
                "max": 12.0,
                "step": 0.5,
                "description": "High band pitch shift",
            },
            "low_cutoff": {"default": 300.0, "min": 50.0, "max": 500.0, "step": 10.0, "description": "Low cutoff (Hz)"},
            "high_cutoff": {
                "default": 3000.0,
                "min": 1000.0,
                "max": 8000.0,
                "step": 100.0,
                "description": "High cutoff (Hz)",
            },
        },
    },
    "resonant_filter_sweep": {
        "cls": LowpassFilter,
        "label": "Resonant Filter Sweep",
        "description": "High-pass, low-pass, or band-pass with LFO sweep over time.",
        "params": {
            "cutoff_start": {
                "default": 200.0,
                "min": 20.0,
                "max": 2000.0,
                "step": 10.0,
                "description": "Start cutoff (Hz)",
            },
            "cutoff_end": {
                "default": 8000.0,
                "min": 500.0,
                "max": 20000.0,
                "step": 100.0,
                "description": "End cutoff (Hz)",
            },
            "resonance": {"default": 0.5, "min": 0.1, "max": 1.0, "step": 0.01, "description": "Resonance (Q)"},
            "lfo_rate": {"default": 0.5, "min": 0.05, "max": 5.0, "step": 0.01, "description": "LFO sweep rate (Hz)"},
        },
    },
    "spectral_repair": {
        "cls": Gain,
        "label": "Spectral Repair",
        "description": "AI-like spectral repair — remove clicks, sibilance, plosives, hum.",
        "params": {
            "strength": {"default": 0.7, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Repair strength"},
        },
    },
    "multi_mic_phase": {
        "cls": Chorus,
        "label": "Multi-Mic Phase Align",
        "description": "Smart phase cancellation for multi-mic bleed removal.",
        "params": {
            "strength": {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "description": "Alignment strength"},
        },
    },
    "smart_crossfade": {
        "cls": Gain,
        "label": "Smart Crossfade",
        "description": "Non-linear adaptive crossfade to prevent volume dips.",
        "params": {
            "fade_length_ms": {
                "default": 50.0,
                "min": 10.0,
                "max": 500.0,
                "step": 10.0,
                "description": "Fade length (ms)",
            },
        },
    },
}


def get_available_effects() -> list[dict[str, Any]]:
    """Return the list of available effect types with their parameter definitions.

    Used by the frontend to build the effects chain editor UI.
    """
    result = []
    for effect_type, info in EFFECT_REGISTRY.items():
        result.append(
            {
                "type": effect_type,
                "label": info["label"],
                "description": info["description"],
                "params": {name: {k: v for k, v in pdef.items()} for name, pdef in info["params"].items()},
            }
        )
    return result


def validate_effects_chain(effects_chain: list[dict[str, Any]]) -> str | None:
    """Validate an effects chain configuration.

    Returns None if valid, or an error message string.
    """
    if not isinstance(effects_chain, list):
        return "effects_chain must be a list"

    for i, effect in enumerate(effects_chain):
        if not isinstance(effect, dict):
            return f"Effect at index {i} must be a dict"

        effect_type = effect.get("type")
        if effect_type not in EFFECT_REGISTRY:
            return f"Unknown effect type '{effect_type}' at index {i}. Available: {list(EFFECT_REGISTRY.keys())}"

        params = effect.get("params", {})
        if not isinstance(params, dict):
            return f"Effect '{effect_type}' at index {i}: params must be a dict"

        registry = EFFECT_REGISTRY[effect_type]
        for param_name, value in params.items():
            if param_name not in registry["params"]:
                return f"Effect '{effect_type}' at index {i}: unknown param '{param_name}'"

            pdef = registry["params"][param_name]
            if not isinstance(value, (int, float)):
                return f"Effect '{effect_type}' at index {i}: param '{param_name}' must be a number"
            if value < pdef["min"] or value > pdef["max"]:
                return (
                    f"Effect '{effect_type}' at index {i}: param '{param_name}' "
                    f"must be between {pdef['min']} and {pdef['max']} (got {value})"
                )

    return None


def build_pedalboard(effects_chain: list[dict[str, Any]]) -> Pedalboard:
    """Build a Pedalboard instance from an effects chain config.

    Skips effects where ``enabled`` is ``False``.
    """
    if not _PEDALBOARD_AVAILABLE:
        raise ImportError("pedalboard is required for audio effects — pip install pedalboard")
    plugins = []
    for effect in effects_chain:
        if not effect.get("enabled", True):
            continue

        effect_type = effect["type"]
        registry = EFFECT_REGISTRY[effect_type]
        cls = registry["cls"]

        # Merge defaults with provided params
        params = {}
        for pname, pdef in registry["params"].items():
            params[pname] = effect.get("params", {}).get(pname, pdef["default"])

        plugins.append(cls(**params))

    return Pedalboard(plugins)


def apply_effects(
    audio: np.ndarray,
    sample_rate: int,
    effects_chain: list[dict[str, Any]],
) -> np.ndarray:
    """Apply an effects chain to audio data.

    Args:
        audio: Input audio array (1-D mono float32).
        sample_rate: Sample rate in Hz.
        effects_chain: List of effect configuration dicts.

    Returns:
        Processed audio array.
    """
    if not effects_chain:
        return audio

    board = build_pedalboard(effects_chain)

    # pedalboard expects shape (channels, samples)
    if audio.ndim == 1:
        audio_2d = audio[np.newaxis, :]
    else:
        audio_2d = audio

    processed = board(audio_2d.astype(np.float32), sample_rate)

    # Return same dimensionality as input
    if audio.ndim == 1:
        return processed[0]
    return processed
