"""Regression: run_generation local path with emotion DSP (crash-path guard).

Guards against the historical ``NameError: name 'logger' is not defined``
crash in the emotion-DSP branch: the branch must execute end-to-end with a
fake engine, and a DSP failure must degrade gracefully (no exception).
"""

import numpy as np
import pytest

import backend.backends as backends_mod
import backend.routes.generations as rg
import backend.services.audio_tags as audio_tags
import backend.services.generation as generation
import backend.services.history as hist
import backend.utils.chunked_tts as chunked_tts

pytest.importorskip("soundfile")


class _FakeEngine:
    def is_loaded(self):
        return True


def _patch_shared(monkeypatch):
    """Stub db / task manager / notifications like the cloud-branch test."""

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


def _patch_synth(monkeypatch, dsp_side_effect=None):
    """Fake chunked synthesis + emotion DSP; return observation dicts."""
    observed = {"dsp_called": False, "saved_audio": None}
    sr = 24000
    audio = np.ones(sr // 10, dtype=np.float32) * 0.25

    async def _fake_generate(model, text, voice_prompt, **kwargs):
        return audio.copy(), sr

    monkeypatch.setattr(chunked_tts, "generate_chunked", _fake_generate)

    if dsp_side_effect is not None:

        def _fake_dsp(audio_in, sample_rate, emotion):
            observed["dsp_called"] = True
            raise dsp_side_effect

        monkeypatch.setattr(audio_tags, "apply_emotion_dsp", _fake_dsp)
    else:

        def _fake_dsp(audio_in, sample_rate, emotion):
            observed["dsp_called"] = True
            return audio_in * 0.5

        monkeypatch.setattr(audio_tags, "apply_emotion_dsp", _fake_dsp)

    def _fake_save(*, generation_id, audio, sample_rate, effects_chain, save_audio, db):
        observed["saved_audio"] = audio
        return f"{generation_id}.wav"

    monkeypatch.setattr(generation, "_save_generate", _fake_save)
    return observed


async def test_emotion_dsp_branch_applies_preset(monkeypatch):
    _patch_shared(monkeypatch)
    observed = _patch_synth(monkeypatch)

    ctx = generation.GenerationContext(
        generation_id="gen-emotion",
        profile_id="p1",
        text="Hello emotion",
        language="en",
        engine="kokoro",
        model_size="82M",
        seed=7,
        mode="generate",
        emotion="warm",
    )
    await generation.run_generation(ctx)

    assert observed["dsp_called"] is True
    # Saved audio must be the DSP-scaled output (0.25 * 0.5).
    assert observed["saved_audio"] is not None
    assert np.allclose(observed["saved_audio"], 0.125, atol=1e-4)


async def test_emotion_dsp_failure_degrades_gracefully(monkeypatch):
    """A DSP exception must not kill the generation (logger branch exists)."""
    _patch_shared(monkeypatch)
    observed = _patch_synth(monkeypatch, dsp_side_effect=ValueError("dsp boom"))

    ctx = generation.GenerationContext(
        generation_id="gen-emotion-fail",
        profile_id="p1",
        text="Hello emotion",
        language="en",
        engine="kokoro",
        model_size="82M",
        seed=7,
        mode="generate",
        emotion="warm",
    )
    await generation.run_generation(ctx)

    assert observed["dsp_called"] is True
    # Generation still completed with the untouched audio.
    assert observed["saved_audio"] is not None
    assert np.allclose(observed["saved_audio"], 0.25, atol=1e-4)
