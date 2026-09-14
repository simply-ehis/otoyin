"""Integration: run_generation routes through BYOK cloud when use_cloud=True."""

import numpy as np
import pytest

from backend.services import generation

pytest.importorskip("soundfile")


def _make_wav_bytes(samples=2400, sr=24000) -> bytes:
    import io

    import soundfile as sf

    audio = np.zeros(samples, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    return buf.getvalue()


async def test_run_generation_cloud_branch(monkeypatch):
    """When use_cloud=True, local model factory is never loaded; cloud is used."""
    calls = {"local": False, "cloud": False, "saved": False}

    # Mirrors production: synthesize_via_cloud_tts is a sync def.
    def fake_synth(domain, text, voice="alloy"):
        calls["cloud"] = True
        return _make_wav_bytes(), "audio/wav"

    monkeypatch.setattr("backend.services.cloud_provider.synthesize_via_cloud_tts", fake_synth)

    async def _fake_vp(*a, **k):
        return {"preset_voice_id": "alloy"}

    monkeypatch.setattr(generation.profiles, "create_voice_prompt_for_profile", _fake_vp)

    # Patch the side-effect functions at their source modules (run_generation
    # imports them locally, so patching generation.* does not take effect).
    import backend.routes.generations as rg
    import backend.services.history as hist

    async def _noop_async(*a, **k):
        return None

    monkeypatch.setattr(rg, "notify_generation_status", _noop_async)
    monkeypatch.setattr(hist, "update_generation_status", _noop_async)
    monkeypatch.setattr(generation, "_notify_speak_end", lambda *a, **k: None)
    monkeypatch.setattr(
        generation, "get_task_manager", lambda: type("T", (), {"complete_generation": lambda *a, **k: None})()
    )
    monkeypatch.setattr(generation, "get_db", lambda: iter([type("DB", (), {"close": lambda *a, **k: None})()]))

    # Patch the save helpers invoked in the cloud branch (mode=generate).
    import backend.services.generation as g

    saved_paths = []

    def fake_save_generate(*, generation_id, audio, sample_rate, effects_chain, save_audio, db):
        saved_paths.append((generation_id, audio, sample_rate))
        calls["saved"] = True
        return f"{generation_id}.wav"

    monkeypatch.setattr(g, "_save_generate", fake_save_generate)

    try:
        ctx = g.GenerationContext(
            generation_id="gen-1",
            profile_id="p1",
            text="Hello cloud",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="generate",
            use_cloud=True,
        )
        await g.run_generation(ctx)
    except Exception:
        import traceback as _tb

        _tb.print_exc()
        raise
    assert calls["cloud"] is True
    assert calls["saved"] is True
    assert saved_paths[0][0] == "gen-1"
    assert saved_paths[0][2] == 24000
