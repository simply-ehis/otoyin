"""
Smoke test: ONNX TTS backend registration + availability contract.

We do NOT download multi-GB model weights in CI. This test verifies the
structural contract the factory relies on:

  * every ONNX backend module imports cleanly,
  * ``is_onnx_available()`` returns the expected bool (gated by deps),
  * the factory resolves each engine to a backend instance, preferring the
    ONNX wrapper when available, else the torch backend (never raises).

Run:  python -m pytest backend/tests/test_onnx_backend_registration.py
"""

import importlib

import pytest

# engine -> (onnx_module, onnx_symbol, torch_module, torch_symbol)
# moss_tts_nano has NO torch fallback: the tuple uses None for the torch side,
# and the factory raises (no ONNX assets) rather than silently picking torch.
# (fish_speech/chattts/f5_tts were removed 2026-09-05: CC-BY-NC weights.)
ENGINE_MAP = {
    "pocket_tts": ("pocket_tts_onnx_backend", "PocketTTSOnnxBackend", "pocket_tts_backend", "PocketTTSBackend"),
    "styletts2": ("styletts2_onnx_backend", "StyleTTS2OnnxBackend", "styletts2_backend", "StyleTTS2Backend"),
    "kokoro": ("kokoro_onnx_backend", "KokoroONNXBackend", "kokoro_backend", "KokoroTTSBackend"),
    "moss_tts_nano": ("moss_tts_nano_onnx_backend", "MossTTSNanoOnnxBackend", None, None),
}


@pytest.mark.parametrize("engine", list(ENGINE_MAP.keys()))
def test_onnx_backend_module_imports(engine):
    onnx_mod, onnx_cls, torch_mod, torch_cls = ENGINE_MAP[engine]
    mod = importlib.import_module(f"backend.backends.{onnx_mod}")
    assert hasattr(mod, onnx_cls)
    assert hasattr(mod, "is_onnx_available")
    # torch fallback present for every engine that has one (moss_tts_nano does not)
    if torch_mod is not None:
        tmod = importlib.import_module(f"backend.backends.{torch_mod}")
        assert hasattr(tmod, torch_cls)


@pytest.mark.parametrize("engine", list(ENGINE_MAP.keys()))
def test_is_onnx_available_is_bool(engine):
    onnx_mod, _, _, _ = ENGINE_MAP[engine]
    mod = importlib.import_module(f"backend.backends.{onnx_mod}")
    assert isinstance(mod.is_onnx_available(), bool)


def test_moss_tts_nano_registered_no_torch_fallback():
    from backend.backends import TTS_ENGINES

    assert "moss_tts_nano" in TTS_ENGINES
    # moss_tts_nano must have no torch backend module — it is ONNX-only
    import os

    backends_dir = os.path.join(os.path.dirname(__file__), "..", "backends")
    assert not os.path.exists(os.path.join(backends_dir, "moss_tts_nano_backend.py"))


def test_removed_nc_engines_rejected():
    """fish_speech/chattts/f5_tts were removed (CC-BY-NC) — unknown engine."""
    from backend.backends import get_tts_backend_for_engine

    for engine in ("fish_speech", "chattts", "f5_tts"):
        with pytest.raises(ValueError, match="Unknown TTS engine"):
            get_tts_backend_for_engine(engine)


@pytest.mark.parametrize("engine", ["pocket_tts", "styletts2", "kokoro"])
def test_factory_resolves_without_raising(engine):
    from backend.backends import get_tts_backend_for_engine

    backend = get_tts_backend_for_engine(engine)
    assert backend is not None
    assert hasattr(backend, "generate")
    assert hasattr(backend, "load_model")


def test_factory_raises_for_moss_without_assets():
    from backend.backends import get_tts_backend_for_engine
    from backend.backends.moss_tts_nano_onnx_backend import is_onnx_available

    if is_onnx_available():
        pytest.skip("ONNX assets present — factory would return the backend")
    with pytest.raises(ValueError, match="MOSS-TTS-Nano requires the ONNX assets"):
        get_tts_backend_for_engine("moss_tts_nano")
