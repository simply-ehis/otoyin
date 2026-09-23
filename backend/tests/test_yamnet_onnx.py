"""YAMNet ONNX audio-event backend: provenance parity + class map + timing.

Parity vectors come straight from the upstream README
(audiomagic/yamnet-onnx): 1 kHz sine -> "Beep, bleep", digital
silence -> "Silence" (~1.00). If those ever fail, the community
export is untrustworthy — do not ship it.
"""

import numpy as np
import pytest

from backend.backends import yamnet_onnx_backend as yam


@pytest.fixture(scope="module")
def backend():
    from backend.backends.base import ModelNotCachedError
    from backend.backends.yamnet_onnx_backend import yamnet_backend

    try:
        yamnet_backend.load_model()
    except ModelNotCachedError:
        pytest.skip("YAMNet weights not resolvable (another test moved the data dir?)")
    return yamnet_backend


def test_frame_timing_math():
    assert yam.frame_time_range(0) == (0.0, 0.96)
    assert yam.frame_time_range(1) == (0.48, 1.44)
    assert yam.frame_time_range(3) == (1.44, 2.4)


def test_class_map_has_target_events(backend):
    names = backend.class_names()
    assert len(names) == 521
    for expected in ("Laughter", "Sigh", "Clapping", "Applause", "Cough", "Speech", "Silence", "Music"):
        assert expected in names, expected


def test_sine_is_beep(backend):
    sr = 16000
    t = np.arange(sr, dtype=np.float32) / sr
    audio = 0.5 * np.sin(2 * np.pi * 1000.0 * t).astype(np.float32)
    frames = backend.score_audio(audio, sr)
    # The export pads sub-length inputs (1 s -> 2 frames); judge frame 0.
    top = max(frames[0]["scores"].items(), key=lambda kv: kv[1])
    assert backend.class_names()[top[0]] == "Beep, bleep"


def test_silence_is_silence(backend):
    audio = np.zeros(16000, dtype=np.float32)
    frames = backend.score_audio(audio, 16000)
    scores = frames[0]["scores"]
    top = max(scores.items(), key=lambda kv: kv[1])
    assert backend.class_names()[top[0]] == "Silence"
    assert top[1] > 0.99


def test_three_seconds_yields_six_frames(backend):
    audio = np.zeros(16000 * 3, dtype=np.float32)
    frames = backend.score_audio(audio, 16000)
    assert len(frames) == 6
    assert frames[0]["start"] == pytest.approx(0.0)
    assert frames[-1]["end"] == pytest.approx(5 * 0.48 + 0.96)


def test_missing_model_is_detectable_without_network(monkeypatch, tmp_path):
    import backend.backends.yamnet_onnx_backend as mod

    monkeypatch.setattr(mod.config, "get_models_dir", lambda: tmp_path)
    assert mod._resolve_files() == (None, None)
    fresh = mod.YamnetOnnxBackend()
    with pytest.raises(Exception, match=r"[Nn]ot found"):
        fresh.class_names()
