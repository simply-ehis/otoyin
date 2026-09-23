"""Unit tests for the MiniMax Music 3 (diffusers ModularPipeline) backend.

Covers repo identity, the manual-license error path, availability contract,
and registry wiring. No real model, weights, or GPU required — everything is
monkeypatched. (This file was previously a copy of the HeartMuLa test; it now
tests the module it is named after.)
"""

import pytest

from backend.backends import minimax_music3_backend as mm
from backend.backends.protocols import MUSIC_ENGINES


def test_repo_identity():
    assert mm.MINIMAX_REPO_ID == "MiniMaxAI/MiniMax-Music3"
    assert mm.minimax_music3_backend.repo_id == mm.MINIMAX_REPO_ID
    assert mm.minimax_music3_backend.sample_rate == 32000


def test_engine_registered():
    assert "minimax_music3" in MUSIC_ENGINES


def test_load_model_uncached_raises_license_guidance(monkeypatch):
    monkeypatch.setattr(mm.minimax_music3_backend, "_is_model_cached", lambda: False)
    with pytest.raises(RuntimeError, match="Accept the license"):
        mm.minimax_music3_backend.load_model()


def test_generate_uncached_raises_without_loading(monkeypatch):
    monkeypatch.setattr(mm.minimax_music3_backend, "_is_model_cached", lambda: False)
    with pytest.raises(RuntimeError, match="not downloaded"):
        mm.minimax_music3_backend.generate(caption="uplifting house music")


def test_is_available_false_without_cache(monkeypatch):
    monkeypatch.setattr(mm.minimax_music3_backend, "_is_model_cached", lambda: False)
    assert mm.minimax_music3_backend.is_available() is False


def test_generate_uses_loaded_pipe(monkeypatch):
    import numpy as np

    class _FakePipe:
        def generate(self, **kwargs):
            assert kwargs["caption"] == "calm piano"
            return np.zeros(160, dtype=np.float32)

    monkeypatch.setattr(mm, "_import_diffusers", lambda: (object(), object()))
    backend = mm.MiniMaxMusic3Backend()
    backend.pipe = _FakePipe()
    audio, sr = backend.generate(caption="calm piano", duration_seconds=1.0)
    assert sr == 32000
    assert np.asarray(audio).ndim == 1
    assert len(audio) == 32000
