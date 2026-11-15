"""
Parametric smoke tests for the 2026-11-14 oneshot_audiocpp registry entries.

Validates that every new audio.cpp backend resolves, retains its spec, and fails
loudly on generate when the download is missing (no real model/binary required).
"""

import asyncio

import pytest

from backend.backends import oneshot_audiocpp as oc
from backend.backends.protocols import MUSIC_ENGINES, SFX_ENGINES, TTS_ENGINES

# Every singleton short-name -> spec attribute on the module
SINGLETONS = {
    "phonon_backend": "PHONON",
    "inflect_v2_backend": "inflect_v2_spec",
    "supertonic_backend": "supertonic_spec",
    "piper_tts_backend": "piper_spec",
    "chatterbox_turbo_backend": "chatterbox_turbo_spec",
    "audio8_tts_backend": "audio8_spec",
    "cosyvoice3_backend": "cosyvoice3_spec",
    "magpie_tts_backend": "magpie_spec",
    "moss_soundeffect_backend": "moss_soundeffect_spec",
    "omnivoice_backend": "omnivoice_spec",
    "yue2_backend": "yue2_spec",
    "zonos3_backend": "zonos3_spec",
    "drama3_backend": "drama3_spec",
    "sa3_music_backend": "sa3_music_spec",
}


def test_all_singletons_importable():
    for name in SINGLETONS:
        assert getattr(oc, name, None) is not None, f"missing singleton {name}"


def test_specs_are_consistent():
    for attr in SINGLETONS.values():
        spec = getattr(oc, attr)
        assert spec.family
        assert spec.model_file
        assert spec.sample_rate > 0


def test_build_args_units():
    args = oc.build_args(
        model="m.gguf",
        text="Hi",
        family="kokoro_tts",
        task="tts",
        voice_id="af_heart",
        reference_wav=None,
        reference_text=None,
        seed=42,
        extra=None,
    )
    assert args[:4] == ["--task", "tts", "--family", "kokoro_tts"]
    assert args[args.index("--model") + 1] == "m.gguf"
    assert args[args.index("--voice-id") + 1] == "af_heart"
    assert args[args.index("--seed") + 1] == "42"


def test_build_args_clone_and_no_voice_id():
    args = oc.build_args(
        model="m.gguf",
        text="Cloning check",
        family="cosyvoice3",
        task="clon",
        reference_wav="ref.wav",
        reference_text="the exact text",
    )
    assert args[args.index("--task") + 1] == "clon"
    assert args[args.index("--voice-ref") + 1] == "ref.wav"
    assert args[args.index("--reference-text") + 1] == "the exact text"
    assert "--voice-id" not in args


def test_emotion_tag_models_wired():
    """Small emotion-tag models: chatterbox-turbo (19 documented tags), bark (6 documented)."""
    from backend.backends import get_all_model_configs

    by_name = {c.model_name: c for c in get_all_model_configs()}

    turbo = by_name["chatterbox-turbo"]
    assert turbo.paralinguistic_tags is True
    assert len(turbo.supported_tags) == 19
    for tag in ("[laugh]", "[sigh]", "[happy]", "[angry]", "[whispering]", "[surprised]"):
        assert tag in turbo.supported_tags

    bark = by_name["bark-small"]
    assert bark.paralinguistic_tags is True
    for tag in ("[laughter]", "[laughs]", "[sighs]", "[gasps]", "[clears throat]", "[music]"):
        assert tag in bark.supported_tags

    inflect = by_name["inflect-micro-v2"]
    assert inflect.engine == "inflect_v2"
    assert inflect.languages == ["en"]
    assert inflect.quant == "F32"  # upstream ships no quant; orig GGUF only


def test_generate_clones_route_to_clon_task(monkeypatch):
    """Reference-protected generate() must use --task clon with the reference wav."""
    from pathlib import Path

    import numpy as np

    sent = []

    def _fake_run(args, **kwargs):
        sent.append((list(args), kwargs))
        return np.zeros(24000, dtype=np.float32), 24000

    monkeypatch.setattr(oc, "find_audiocpp", lambda: Path("tmp/audiocpp_cli.exe"))
    monkeypatch.setattr(
        oc.OneShotAudiocpp,
        "_is_model_cached",
        lambda self, *a, **k: True,
    )
    monkeypatch.setattr(oc, "run_one_shot", _fake_run)

    async def _go():
        await oc.cosyvoice3_backend.generate("cloning check", {"audio_path": "ref.wav", "reference_text": "exact"})

    asyncio.run(_go())
    args = sent[0][0]
    assert args[args.index("--task") + 1] == "clon"
    assert args[args.index("--voice-ref") + 1] == "ref.wav"


def test_generate_magpie_uses_request_option_not_voice_id(monkeypatch):
    """MagpieTTS selects baked voices via --request-option voice_id=<name>."""
    from pathlib import Path

    import numpy as np

    sent = []

    def _fake_run(args, **kwargs):
        sent.append((list(args), kwargs))
        return np.zeros(24000, dtype=np.float32), 24000

    monkeypatch.setattr(oc, "find_audiocpp", lambda: Path("tmp/audiocpp_cli.exe"))
    monkeypatch.setattr(oc.OneShotAudiocpp, "_is_model_cached", lambda self, *a, **k: True)
    monkeypatch.setattr(oc, "run_one_shot", _fake_run)

    async def _go():
        await oc.magpie_tts_backend.generate("magpie check", {"voice_id": "Sofia"})

    asyncio.run(_go())
    args = sent[0][0]
    assert "--voice-id" not in args
    assert args[args.index("--request-option") + 1] == "voice_id=Sofia"


def test_generate_supertonic_uses_voice_id(monkeypatch):
    from pathlib import Path

    import numpy as np

    sent = []

    def _fake_run(args, **kwargs):
        sent.append((list(args), kwargs))
        return np.zeros(24000, dtype=np.float32), 24000

    monkeypatch.setattr(oc, "find_audiocpp", lambda: Path("tmp/audiocpp_cli.exe"))
    monkeypatch.setattr(oc.OneShotAudiocpp, "_is_model_cached", lambda self, *a, **k: True)
    monkeypatch.setattr(oc, "run_one_shot", _fake_run)

    async def _go():
        await oc.supertonic_backend.generate("supertonic check", {"voice_id": "M1"})

    asyncio.run(_go())
    args = sent[0][0]
    assert args[args.index("--voice-id") + 1] == "M1"


def test_generate_new_engines_registered():
    # engines exposed through the public registry resolve cleanly.
    from backend.backends.registry import get_tts_backend_for_engine

    for engine, family in (
        ("magpie_tts", "magpie_tts"),
        ("cosyvoice3", "cosyvoice3"),
        ("audio8_tts", "audio8_tts"),
        ("zonos3", "zonos3"),
    ):
        backend = get_tts_backend_for_engine(engine)
        assert backend is not None
        assert backend.spec.family == family


def test_new_engines_registered():
    for engine in (
        "phonon",
        "inflect_v2",
        "supertonic",
        "piper_tts",
        "chatterbox_turbo",
        "audio8_tts",
        "cosyvoice3",
        "magpie_tts",
        "omnivoice",
        "yue2",
        "zonos3",
        "fish_drama3",
        "moss_soundeffect",
        "sa3_music",
    ):
        assert engine in TTS_ENGINES, engine

    for engine in ("sa3_music", "moss_soundeffect", "yue2"):
        assert engine in MUSIC_ENGINES, engine

    for engine in ("sa3_sfx", "moss_soundeffect"):
        assert engine in SFX_ENGINES, engine


def test_generate_missing_model_raises():
    from backend.services import model_files

    backend = oc.supertonic_backend
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(model_files, "is_model_installed", lambda *a, **k: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        asyncio.run(backend.generate("Hi", {"voice_id": "M1"}))
    monkeypatch.undo()


def test_bridge_via_registry():
    # Pre-registered through phase 1: the factory resolves cleanly without raising.
    from backend.backends.registry import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine("kokoro")
    assert backend is not None

    backend_phonon = get_tts_backend_for_engine("phonon")
    assert backend_phonon is not None
    assert backend_phonon.spec.family == "gradium_phonon"

    backend_supertonic = get_tts_backend_for_engine("supertonic")
    assert backend_supertonic is not None

    backend_zonos3 = get_tts_backend_for_engine("zonos3")
    assert backend_zonos3 is not None

    backend_drama3 = get_tts_backend_for_engine("fish_drama3")
    assert backend_drama3 is not None

    backend_inflect = get_tts_backend_for_engine("inflect_v2")
    assert backend_inflect is not None
    assert backend_inflect.spec.family == "inflect_v2"
