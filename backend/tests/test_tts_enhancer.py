"""TTS enhancer (Phase 1 voice clean): chain units + run_generation hook.

Unit level exercises ``enhance_tts`` directly with the offline spectral
fallback. Integration level guards the hook wiring in ``run_generation``:
the chain runs only when ``voice_clean`` is set, and a failure degrades
gracefully instead of killing the generation (same crash-path guard the
emotion-DSP branch has).
"""

import numpy as np
import pytest

import backend.backends as backends_mod
import backend.routes.generations as rg
import backend.services.generation as generation
import backend.services.history as hist
import backend.services.tts_enhancer as tts_enhancer
import backend.utils.chunked_tts as chunked_tts

pytest.importorskip("soundfile")

SR = 24000


def _synthetic() -> np.ndarray:
    t = np.linspace(0, 0.5, int(SR * 0.5), endpoint=False)
    audio = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.1 * np.sin(2 * np.pi * 5000 * t)
    return audio.astype(np.float32)


def test_empty_passthrough():
    out = tts_enhancer.enhance_tts(np.array([], dtype=np.float32), SR)
    assert out.size == 0


def test_all_stages_off_is_identity():
    audio = _synthetic()
    out = tts_enhancer.enhance_tts(audio, SR, {"denoise": False, "deesser": False, "warmth": False, "dynamics": False})
    np.testing.assert_array_equal(out, audio)


def test_cast_to_float32_and_bounds():
    audio = (_synthetic() * 32767).astype(np.int16)
    out = tts_enhancer.enhance_tts(audio, SR)
    assert out.dtype == np.float32
    assert out.shape == audio.shape
    assert np.all(np.isfinite(out))
    assert out.min() >= -1.0 and out.max() <= 1.0


def test_default_chain_runs_offline():
    audio = _synthetic()
    out = tts_enhancer.enhance_tts(audio, SR)
    assert out.shape == audio.shape
    assert np.all(np.isfinite(out))


@pytest.mark.parametrize("preset", ["light", "medium", "heavy"])
def test_presets_run(preset):
    audio = _synthetic()
    out = tts_enhancer.enhance_tts(audio, SR, {"preset": preset})
    assert out.shape == audio.shape
    assert np.all(np.isfinite(out))


def test_stage_failure_degrades_gracefully(monkeypatch):
    def _boom(audio_in, sample_rate, params):
        raise RuntimeError("denoise boom")

    monkeypatch.setattr(tts_enhancer, "_denoise", _boom)
    audio = _synthetic()
    out = tts_enhancer.enhance_tts(audio, SR)
    assert out.shape == audio.shape
    assert np.all(np.isfinite(out))


# --- run_generation hook ---------------------------------------------------


class _FakeEngine:
    def is_loaded(self):
        return True


def _patch_shared(monkeypatch):
    async def _noop_async(*a, **k):
        return None

    monkeypatch.setattr(rg, "notify_generation_status", _noop_async)
    monkeypatch.setattr(hist, "update_generation_status", _noop_async)
    monkeypatch.setattr(generation, "_notify_speak_end", lambda *a, **k: None)
    monkeypatch.setattr(
        generation, "get_task_manager", lambda: type("T", (), {"complete_generation": lambda *a, **k: None})()
    )
    monkeypatch.setattr(generation, "get_db", lambda: iter([type("DB", (), {"close": lambda *a, **k: None})()]))
    monkeypatch.setattr(generation, "lifecycle_manager", type("L", (), {"mark_model_used": lambda *a, **k: None})())

    async def _fake_vp(*a, **k):
        return None

    monkeypatch.setattr(generation.profiles, "create_voice_prompt_for_profile", _fake_vp)

    async def _fake_load(engine, model_size):
        return None

    monkeypatch.setattr(backends_mod, "get_tts_backend_for_engine", lambda engine: _FakeEngine())
    monkeypatch.setattr(backends_mod, "load_engine_model", _fake_load)
    monkeypatch.setattr(backends_mod, "engine_needs_trim", lambda engine: False)


def _patch_synth(monkeypatch, enhancer_side_effect=None):
    """Fake chunked synthesis + TTS enhancer; return observation dicts."""
    observed = {"enhancer_called": False, "saved_audio": None}
    audio = np.ones(SR // 10, dtype=np.float32) * 0.25

    async def _fake_generate(model, text, voice_prompt, **kwargs):
        return audio.copy(), SR

    monkeypatch.setattr(chunked_tts, "generate_chunked", _fake_generate)

    def _fake_enhance(audio_in, sample_rate, params=None, **kwargs):
        observed["enhancer_called"] = True
        if enhancer_side_effect is not None:
            raise enhancer_side_effect
        return audio_in * 0.5

    monkeypatch.setattr(tts_enhancer, "enhance_tts", _fake_enhance)

    def _fake_save(*, generation_id, audio, sample_rate, effects_chain, save_audio, db):
        observed["saved_audio"] = audio
        return f"{generation_id}.wav"

    monkeypatch.setattr(generation, "_save_generate", _fake_save)
    return observed


async def test_voice_clean_runs_when_flagged(monkeypatch):
    _patch_shared(monkeypatch)
    observed = _patch_synth(monkeypatch)

    ctx = generation.GenerationContext(
        generation_id="gen-clean",
        profile_id="p1",
        text="Hello clean",
        language="en",
        engine="kokoro",
        model_size="82M",
        seed=7,
        mode="generate",
        voice_clean=True,
    )
    await generation.run_generation(ctx)

    assert observed["enhancer_called"] is True
    assert observed["saved_audio"] is not None
    assert np.allclose(observed["saved_audio"], 0.125, atol=1e-4)


async def test_voice_clean_skipped_when_not_flagged(monkeypatch):
    _patch_shared(monkeypatch)
    observed = _patch_synth(monkeypatch)

    ctx = generation.GenerationContext(
        generation_id="gen-plain",
        profile_id="p1",
        text="Hello plain",
        language="en",
        engine="kokoro",
        model_size="82M",
        seed=7,
        mode="generate",
    )
    await generation.run_generation(ctx)

    assert observed["enhancer_called"] is False
    assert observed["saved_audio"] is not None
    assert np.allclose(observed["saved_audio"], 0.25, atol=1e-4)


async def test_voice_clean_failure_degrades_gracefully(monkeypatch):
    _patch_shared(monkeypatch)
    observed = _patch_synth(monkeypatch, enhancer_side_effect=RuntimeError("clean boom"))

    ctx = generation.GenerationContext(
        generation_id="gen-clean-fail",
        profile_id="p1",
        text="Hello clean fail",
        language="en",
        engine="kokoro",
        model_size="82M",
        seed=7,
        mode="generate",
        voice_clean=True,
    )
    await generation.run_generation(ctx)

    assert observed["enhancer_called"] is True
    assert observed["saved_audio"] is not None
    assert np.allclose(observed["saved_audio"], 0.25, atol=1e-4)


# --- Per-engine preset tests (Phase 2) -----------------------------------


def test_engine_preset_light_for_clean_engines():
    """Light engines (kokoro, kitten-tts) should use the 'light' preset."""
    _ = _synthetic()
    for engine in ("kokoro", "kitten-tts-nano", "moss-tts-nano"):
        merged = tts_enhancer._resolve_params(None, engine=engine)
        # light preset has dynamics=False, warmth=True
        assert merged["dynamics"] is False, f"{engine} should be light preset"
        assert merged["warmth"] is True


def test_engine_preset_heavy_for_synthetic_engines():
    """Heavy engines (parler-tts-mini, orpheus) should use the 'heavy' preset."""
    for engine in ("parler-tts-mini", "orpheus"):
        merged = tts_enhancer._resolve_params(None, engine=engine)
        assert merged["dynamics"] is True, f"{engine} should be heavy preset"
        assert merged["denoise"] is True


def test_engine_preset_fallback_to_medium():
    """Unknown engines should fall back to medium."""
    merged = tts_enhancer._resolve_params(None, engine="unknown-engine")
    assert merged == tts_enhancer._PRESETS["medium"]


def test_explicit_preset_overrides_engine_default():
    """When params specify a preset, the engine default is ignored."""
    merged = tts_enhancer._resolve_params({"preset": "heavy"}, engine="kokoro")
    # kokoro default is light (dynamics=False), but explicit heavy wins
    assert merged["dynamics"] is True


def test_enhance_tts_with_engine_param():
    """enhance_tts passes engine to _resolve_params correctly."""
    audio = _synthetic()
    # kokoro should use light preset (no dynamics stage)
    # Since dynamics is skipped for light, the output should match
    out = tts_enhancer.enhance_tts(audio, SR, engine="kokoro")
    assert out.shape == audio.shape
    assert np.all(np.isfinite(out))


def test_strength_override_with_engine():
    """Engine provides preset, but explicit strength still works."""
    merged = tts_enhancer._resolve_params({"strength": 0.3}, engine="orpheus")
    assert merged["dynamics"] is True  # from orpheus heavy preset
    assert merged["strength"] == 0.3  # from explicit param
