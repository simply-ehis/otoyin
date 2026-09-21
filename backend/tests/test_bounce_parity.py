"""Render-then-export parity (P0.3): every effect Render FX supports must also
render on the export path instead of being silently skipped.

Export (bounce/mixer/plugins) renders through
``backend.services.effects_chain`` while Render FX uses
``backend.services.effects``. These tests pin that both engines agree and
that the extended types (telephone, vocoder, auto-tune, …) actually transform
audio on the export path.
"""

import numpy as np
import pytest

from backend.routes.audio_pipeline.bounce import _apply_effects_multichannel
from backend.services import effects as render_fx, effects_chain as export_fx
from backend.services.effects import EffectConfig

SR = 22050

# Extended types Render FX supports that the export engine used to skip.
EXTENDED_TYPES = ["telephone", "vocoder", "auto_tune", "megaphone", "underwater"]


def _tone(freq: float = 220.0, dur: float = 0.3) -> np.ndarray:
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


@pytest.mark.parametrize("effect_type", EXTENDED_TYPES)
def test_export_applies_extended_effects(effect_type: str):
    """Export path must transform audio for extended types, not pass it through."""
    # auto-tune only corrects detectable detune (frame-quantized), so feed it
    # a 360 Hz tone it demonstrably pulls toward the nearest note.
    freq = 360.0 if effect_type == "auto_tune" else 220.0
    audio = _tone(freq)
    chain = [EffectConfig(effect_type=effect_type, enabled=True, params={})]
    out = export_fx.apply_effects_chain(audio, SR, chain)
    assert out.shape == audio.shape
    assert not np.allclose(out, audio), f"{effect_type} was silently skipped on export"


@pytest.mark.parametrize("effect_type", [*EXTENDED_TYPES, "distortion"])
def test_export_matches_render_fx(effect_type: str):
    """Render-then-export parity: both engines produce identical output.

    NOTE: reverb is deliberately excluded — the two engines handle reverb
    tails differently (output length differs). That is a known follow-up,
    not a silent skip; see the P0.3 roadmap entry.
    """
    audio = _tone()
    chain = [EffectConfig(effect_type=effect_type, enabled=True, params={})]
    exported = export_fx.apply_effects_chain(audio, SR, chain)
    rendered = render_fx.apply_effects_chain(audio, SR, chain)
    assert np.allclose(exported, rendered, atol=1e-6), f"{effect_type} diverges"


def test_bounce_stereo_path_applies_telephone():
    """The exact bounce helper (per-channel stereo) must apply telephone."""
    mono = _tone()
    stereo = np.stack([mono, mono], axis=1)
    chain = [EffectConfig(effect_type="telephone", enabled=True, params={})]
    out = _apply_effects_multichannel(stereo, SR, chain)
    assert out.shape == stereo.shape
    assert not np.allclose(out[:, 0], mono), "telephone skipped on bounce stereo path"


def test_truly_unknown_effect_still_surfaced():
    """An effect neither engine knows must fail loudly, never pass through silently."""
    audio = _tone()
    chain = [EffectConfig(effect_type="not-a-real-effect", enabled=True, params={})]
    with pytest.raises(ValueError):
        export_fx.apply_effects_chain(audio, SR, chain)
