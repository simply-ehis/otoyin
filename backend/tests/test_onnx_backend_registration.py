"""
Smoke test: TTS engine registration + availability contract after the
audio.cpp consolidation (2026-11).

We do NOT download multi-GB model weights in CI. This test verifies the
structural contract the factory relies on:

  * migrated engines resolve to their one-shot singleton backends,
  * the new backend modules import cleanly,
  * the removed engines stay unknown.

Run:  python -m pytest backend/tests/test_onnx_backend_registration.py
"""

import pytest

SINGLETON_MAP = {
    "kokoro": ("kokoro_tts_backend", "kokoro_backend"),
    "pocket_tts": ("pocket_tts_backend", "pocket_tts_backend"),
    "moss_tts_nano": ("moss_tts_nano_backend", "moss_tts_nano_backend"),
    "kitten_tts": ("kitten_tts_backend", "kitten_tts_backend"),
    "neutts_2e": ("neutts_2e_backend", "neutts_2e_backend"),
    "qwen3_tts": ("qwen3_tts_backend", "qwen3_tts_backend"),
    "fish_speech_s2": ("fish_speech_s2_backend", "fish_speech_s2_backend"),
    "voxcpm2": ("voxcpm2_backend", "voxcpm2_backend"),
}


@pytest.mark.parametrize("engine", list(SINGLETON_MAP.keys()))
def test_singleton_module_imports(engine):
    import importlib

    mod, attr = SINGLETON_MAP[engine]
    module = importlib.import_module(f"backend.backends.{mod}")
    assert getattr(module, attr, None) is not None


@pytest.mark.parametrize("engine", list(SINGLETON_MAP.keys()))
def test_factory_resolves_without_raising(engine):
    from backend.backends import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine(engine)
    assert backend is not None
    assert hasattr(backend, "generate")
    assert hasattr(backend, "load_model")


def test_moss_tts_nano_registered():
    from backend.backends import TTS_ENGINES

    assert "moss_tts_nano" in TTS_ENGINES


def test_removed_nc_engines_rejected():
    """fish_speech/chattts/f5_tts were removed (CC-BY-NC) - unknown engine."""
    from backend.backends import get_tts_backend_for_engine

    for engine in ("fish_speech", "chattts", "f5_tts", "styletts2"):
        with pytest.raises(ValueError, match="Unknown TTS engine"):
            get_tts_backend_for_engine(engine)


def test_zonos_rejected():
    """zonos_gguf was removed 2026-11 in favour of ZONOS3-Mini."""
    from backend.backends import get_tts_backend_for_engine

    with pytest.raises(ValueError, match="Unknown TTS engine"):
        get_tts_backend_for_engine("zonos_gguf")
