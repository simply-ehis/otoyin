"""Tests for the KittenTTS ONNX engine (tokenization + inference wiring, no download)."""

import numpy as np

from backend.backends import _kitten_tts_onnx as kmod


def test_text_cleaner_drops_unknown_chars():
    ids = kmod._text_cleaner("Abc!?")
    # 'A','b','c' map to known ids; '!','?' are in the punctuation set too.
    assert all(0 <= i < len(kmod._SYMBOLS) for i in ids)
    assert len(ids) == 5  # A b c ! ?


def test_build_input_ids_wraps_start_end():
    ids = kmod._build_input_ids("Hello")
    arr = np.asarray(ids)
    assert arr.shape[0] == 1
    assert arr[0, 0] == 0
    assert arr[0, -1] == 0


def _fake_config_path(tmp_path, model_file="m.onnx", voices="v.npz"):
    cfg = {
        "name": "Kitten TTS Mini",
        "version": "0.8",
        "type": "ONNX2",
        "model": "kitten-tts-mini-0.8",
        "voices": voices,
        "model_file": model_file,
        "speed_priors": {},
        "voice_aliases": {
            "Bella": "expr-voice-2-f",
            "Jasper": "expr-voice-2-m",
            "Luna": "expr-voice-3-f",
            "Bruno": "expr-voice-3-m",
            "Rosie": "expr-voice-4-f",
            "Hugo": "expr-voice-4-m",
            "Kiki": "expr-voice-5-f",
            "Leo": "expr-voice-5-m",
        },
    }
    p = tmp_path / "config.json"
    p.write_text(__import__("json").dumps(cfg), encoding="utf-8")
    return str(p)


def test_kittentts_generate_wiring(monkeypatch, tmp_path):
    """Drive the engine with a mocked ONNX session; assert I/O contract."""
    captured = {}

    class FakeSession:
        def __init__(self, path, providers=None):
            self.path = path
            self.providers = providers

        def run(self, _, inputs):
            captured["inputs"] = inputs
            n = inputs["input_ids"].shape[1] * 100
            return [np.zeros((1, n), dtype=np.float32)]

    class FakeVoices:
        def __init__(self, data):
            self._d = data

        def __getitem__(self, key):
            return self._d[key]

        def keys(self):
            return self._d.keys()

    voices = {"expr-voice-5-m": np.zeros((3, 256), dtype=np.float32)}  # Leo (default)

    monkeypatch.setattr("numpy.load", lambda *a, **k: FakeVoices(voices))
    monkeypatch.setattr("huggingface_hub.hf_hub_download", lambda *a, **k: _fake_config_path(tmp_path))
    import onnxruntime

    monkeypatch.setattr(onnxruntime, "InferenceSession", FakeSession)

    engine = kmod.KittenTTSOnnx(model_dir="", size="mini")
    assert "Leo" in engine.available_voices
    audio = engine.generate("Hello there", voice="Leo", speed=1.0)
    assert isinstance(audio, np.ndarray)
    assert audio.dtype == np.float32
    assert captured["inputs"]["style"].shape == (1, 256)
    assert captured["inputs"]["input_ids"].dtype == np.int64
    assert captured["inputs"]["speed"].dtype == np.float32


def test_kittentts_voice_alias_resolution(monkeypatch, tmp_path):
    voices = {"expr-voice-2-m": np.zeros((2, 256), dtype=np.float32)}  # Jasper
    monkeypatch.setattr(
        "numpy.load",
        lambda *a, **k: type("V", (), {"__getitem__": lambda s, k: voices[k], "keys": lambda s: voices.keys()})(),
    )
    import onnxruntime

    monkeypatch.setattr(onnxruntime, "InferenceSession", lambda *a, **k: None)
    monkeypatch.setattr("huggingface_hub.hf_hub_download", lambda *a, **k: _fake_config_path(tmp_path))

    engine = kmod.KittenTTSOnnx(model_dir="", size="mini")
    # 'Jasper' must resolve to the internal id without raising
    assert "Jasper" in engine.available_voices
    assert engine._voice_aliases["Jasper"] == "expr-voice-2-m"
