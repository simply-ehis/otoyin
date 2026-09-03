"""Extended TTS enhancer tests — stage combinations, boundary conditions,
parameter edge cases, and engine preset completeness.
"""

import numpy as np
import pytest

import backend.services.tts_enhancer as tts_enhancer

pytest.importorskip("soundfile")

SR = 24000


def _synthetic(duration: float = 0.5) -> np.ndarray:
    t = np.linspace(0, duration, int(SR * duration), endpoint=False)
    audio = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.1 * np.sin(2 * np.pi * 5000 * t)
    return audio.astype(np.float32)


# ── Individual stage isolation ───────────────────────────────────────────


class TestStageIsolation:
    """Each stage can run independently without affecting the others."""

    def test_only_denoise(self):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": True,
                "deesser": False,
                "warmth": False,
                "dynamics": False,
            },
        )
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_only_deesser(self):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": True,
                "warmth": False,
                "dynamics": False,
            },
        )
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_only_warmth(self):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": False,
                "warmth": True,
                "dynamics": False,
            },
        )
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_only_dynamics(self):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": False,
                "warmth": False,
                "dynamics": True,
            },
        )
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))


# ── Two-stage combos ────────────────────────────────────────────────────


class TestTwoStageCombos:
    """Pairs of stages run correctly together."""

    def test_denoise_plus_deesser(self):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": True,
                "deesser": True,
                "warmth": False,
                "dynamics": False,
            },
        )
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_warmth_plus_dynamics(self):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": False,
                "warmth": True,
                "dynamics": True,
            },
        )
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))


# ── Strength boundary conditions ────────────────────────────────────────


class TestStrengthBounds:
    """Strength parameter is clamped and affects processing."""

    def test_strength_zero_minimal_change(self):
        """Strength=0 should produce near-identity output (de-ess + warmth gains ~0)."""
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": True,
                "warmth": True,
                "dynamics": False,
                "strength": 0.0,
            },
        )
        # With strength=0, deesser strength is 0*0.6=0 and warmth gains are 0dB
        # Output should be very close to input
        np.testing.assert_allclose(out, audio, atol=1e-3)

    def test_strength_clamped_above_one(self):
        """Strength>1 is clamped to 1 inside enhance_tts."""
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR, {"strength": 1.5})
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_strength_clamped_below_zero(self):
        """Strength<0 is clamped to 0 inside enhance_tts."""
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR, {"strength": -0.5})
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_strength_affects_output(self):
        """Different strength values produce different outputs."""
        audio = _synthetic()
        out_low = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": True,
                "warmth": True,
                "dynamics": False,
                "strength": 0.2,
            },
        )
        out_high = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": True,
                "warmth": True,
                "dynamics": False,
                "strength": 1.0,
            },
        )
        assert not np.allclose(out_low, out_high, atol=1e-4)


# ── Output invariant checks ────────────────────────────────────────────


class TestOutputInvariants:
    """Every code path must produce finite, clipped output."""

    @pytest.mark.parametrize("preset", ["light", "medium", "heavy"])
    def test_preset_output_is_finite_and_clipped(self, preset):
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR, {"preset": preset})
        assert out.dtype == np.float32
        assert np.all(np.isfinite(out))
        assert out.min() >= -1.0
        assert out.max() <= 1.0

    def test_short_audio(self):
        """Very short audio (100 samples) should not crash."""
        audio = np.random.default_rng(42).standard_normal(100).astype(np.float32) * 0.1
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_silent_audio(self):
        """All-zero audio should pass through without NaN/Inf."""
        audio = np.zeros(SR, dtype=np.float32)
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_loud_audio_clipped(self):
        """Audio exceeding ±1.0 gets clipped to [-1, 1]."""
        audio = np.ones(SR, dtype=np.float32) * 2.0
        out = tts_enhancer.enhance_tts(
            audio,
            SR,
            {
                "denoise": False,
                "deesser": False,
                "warmth": False,
                "dynamics": True,
            },
        )
        assert out.max() <= 1.0
        assert out.min() >= -1.0

    def test_int16_input_cast(self):
        """Integer input is cast to float32 internally."""
        audio = (_synthetic() * 32767).astype(np.int16)
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.dtype == np.float32


# ── Engine preset completeness ──────────────────────────────────────────


class TestEnginePresetCompleteness:
    """All engines in ENGINE_PRESETS map to known preset names."""

    def test_all_preset_names_valid(self):
        for engine, preset in tts_enhancer.ENGINE_PRESETS.items():
            assert preset in tts_enhancer._PRESETS, f"Engine '{engine}' maps to unknown preset '{preset}'"

    def test_all_preset_keys_are_strings(self):
        for engine in tts_enhancer.ENGINE_PRESETS:
            assert isinstance(engine, str)

    def test_medium_preset_has_all_stages(self):
        medium = tts_enhancer._PRESETS["medium"]
        for stage in ("denoise", "deesser", "warmth", "dynamics"):
            assert stage in medium, f"medium preset missing '{stage}'"

    def test_light_preset_no_dynamics(self):
        light = tts_enhancer._PRESETS["light"]
        assert light["dynamics"] is False
        assert light["denoise"] is True
        assert light["deesser"] is True
        assert light["warmth"] is True


# ── _resolve_params edge cases ─────────────────────────────────────────


class TestResolveParamsEdgeCases:
    """Parameter resolution edge cases."""

    def test_none_params_none_engine(self):
        """No params, no engine → full defaults."""
        merged = tts_enhancer._resolve_params(None, engine=None)
        assert merged == tts_enhancer._DEFAULTS

    def test_empty_params_dict(self):
        """Empty params dict → full defaults."""
        merged = tts_enhancer._resolve_params({})
        assert merged == tts_enhancer._DEFAULTS

    def test_params_without_preset(self):
        """Params without preset key → full defaults + overrides."""
        merged = tts_enhancer._resolve_params({"strength": 0.5})
        assert merged["strength"] == 0.5
        assert merged["denoise"] is True  # from defaults

    def test_invalid_preset_ignored(self):
        """Invalid preset name is ignored, defaults used."""
        merged = tts_enhancer._resolve_params({"preset": "invalid"})
        assert merged == tts_enhancer._DEFAULTS

    def test_engine_none_falls_back_to_medium(self):
        """Engine=None and no params → defaults (same as medium)."""
        merged = tts_enhancer._resolve_params(None, engine=None)
        assert merged["dynamics"] is True

    def test_params_override_engine_preset(self):
        """Explicit per-stage booleans override engine preset."""
        merged = tts_enhancer._resolve_params({"denoise": False}, engine="chattts")
        # chattts defaults to heavy (denoise=True), but explicit override wins
        assert merged["denoise"] is False
        assert merged["dynamics"] is True  # still from heavy preset


# ── Stage failure resilience ────────────────────────────────────────────


class TestStageFailureResilience:
    """Individual stage failures degrade gracefully."""

    def test_deesser_failure_preserves_audio(self, monkeypatch):
        def _boom(audio, sr, params):
            raise RuntimeError("deesser boom")

        monkeypatch.setattr(tts_enhancer, "_deess", _boom)
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_warmth_failure_preserves_audio(self, monkeypatch):
        def _boom(audio, sr, strength):
            raise RuntimeError("warmth boom")

        monkeypatch.setattr(tts_enhancer, "_warmth_eq", _boom)
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_dynamics_failure_preserves_audio(self, monkeypatch):
        def _boom(audio, sr):
            raise RuntimeError("dynamics boom")

        monkeypatch.setattr(tts_enhancer, "_dynamics", _boom)
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))

    def test_multiple_failures_still_produce_output(self, monkeypatch):
        """Even if denoise + deesser both fail, warmth + dynamics still run."""

        def _boom_denoise(audio, sr):
            raise RuntimeError("denoise boom")

        def _boom_deess(audio, sr, strength):
            raise RuntimeError("deesser boom")

        monkeypatch.setattr(tts_enhancer, "_denoise", _boom_denoise)
        monkeypatch.setattr(tts_enhancer, "_deess", _boom_deess)
        audio = _synthetic()
        out = tts_enhancer.enhance_tts(audio, SR)
        assert out.shape == audio.shape
        assert np.all(np.isfinite(out))
