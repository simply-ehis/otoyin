"""Scribe-shaped JSON normalizer: words + speakers + events -> video-use contract.

Pure-function tests (no models, no audio files): the packer downstream
assumes sorted, monotonic entries with types in {word, spacing,
audio_event} and speaker_N IDs.
"""

import numpy as np

from backend.services import scribe_json as sj


def test_normalize_milliseconds_to_seconds():
    raw = [{"word": "hi", "start_ms": 1000.0, "end_ms": 1500.0, "confidence": 0.9}]
    out = sj.normalize_words(raw, unit="ms")
    assert out == [{"text": "hi", "start": 1.0, "end": 1.5}]


def test_normalize_seconds_passthrough():
    raw = [{"text": "hello world", "start": 2.0, "end": 3.5}]
    out = sj.normalize_words(raw, unit="s")
    assert out == [{"text": "hello world", "start": 2.0, "end": 3.5}]


def test_normalize_drops_empty_text():
    raw = [{"word": "  ", "start_ms": 0.0, "end_ms": 100.0}]
    assert sj.normalize_words(raw, unit="ms") == []


def test_spacing_synthesized_from_gaps():
    words = [
        {"text": "a", "start": 0.0, "end": 0.5},
        {"text": "b", "start": 1.5, "end": 2.0},
    ]
    out = sj.synthesize_spacing(words)
    assert len(out) == 3
    assert out[1]["type"] == "spacing"
    assert out[1]["start"] == 0.5
    assert out[1]["end"] == 1.5


def test_no_spacing_for_adjacent_words():
    words = [
        {"text": "a", "start": 0.0, "end": 0.5},
        {"text": "b", "start": 0.5, "end": 1.0},
    ]
    out = sj.synthesize_spacing(words)
    assert all(w.get("type", "word") == "word" for w in out)


def test_speakers_attached_from_turns():
    from backend.services.diarization import SpeakerTurn

    words = [{"text": "a", "start": 0.0, "end": 1.0}]
    turns = [SpeakerTurn(start=0.0, end=5.0, speaker="speaker_1")]
    out = sj.attach_speakers(words, turns)
    assert out[0]["speaker_id"] == "speaker_1"


def test_speakers_default_when_no_turns():
    out = sj.attach_speakers([{"text": "a", "start": 0.0, "end": 1.0}], [])
    assert out[0]["speaker_id"] == "speaker_0"


def test_events_merged_across_frames():
    frames = [
        {"start": 0.0, "end": 0.96, "label": "laughter", "score": 0.9},
        {"start": 0.48, "end": 1.44, "label": "laughter", "score": 0.8},
        {"start": 5.0, "end": 5.96, "label": "applause", "score": 0.7},
    ]
    out = sj.merge_event_tokens(frames)
    assert len(out) == 2
    assert out[0] == {"text": "laughter", "start": 0.0, "end": 1.44, "type": "audio_event", "score": 0.9}
    assert out[1]["text"] == "applause"


def test_full_build_is_sorted_and_typed():
    words = [
        {"text": "b", "start": 1.5, "end": 2.0, "speaker_id": "speaker_0"},
        {"text": "a", "start": 0.0, "end": 0.5, "speaker_id": "speaker_0"},
    ]
    events = [{"text": "laughter", "start": 1.0, "end": 1.4, "type": "audio_event"}]
    doc = sj.build_scribe_json(words, events)
    assert doc["text"] == "a b"
    starts = [w["start"] for w in doc["words"]]
    assert starts == sorted(starts)
    assert {w["type"] for w in doc["words"]} <= {"word", "spacing", "audio_event"}


def test_peak_dbfs_silence_and_tone():
    assert sj.audio_peak_dbfs(np.zeros(16000, dtype=np.float32)) == float("-inf")
    tone = (0.5 * np.sin(2 * np.pi * 440 * np.arange(16000) / 16000)).astype(np.float32)
    peak = sj.audio_peak_dbfs(tone)
    assert -7.0 < peak < -5.0


def test_event_vocabulary_covers_takes_events():
    for label in ("Laughter", "Applause", "Sigh", "Cough", "Music"):
        assert label in sj.EVENT_VOCABULARY
    assert "Speech" not in sj.EVENT_VOCABULARY
    assert "Silence" not in sj.EVENT_VOCABULARY


def _write_tone(path, seconds=1.0, freq=440.0, amp=0.5):
    import soundfile as sf

    sr = 16000
    t = np.arange(int(sr * seconds), dtype=np.float32) / sr
    sf.write(str(path), (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32), sr)


async def test_build_capture_json_with_stubs(monkeypatch, tmp_path):
    import backend.services.scribe_json as mod
    from backend.services.diarization import SpeakerTurn

    wav = tmp_path / "cap.wav"
    _write_tone(wav)
    calls = {"words": 0}

    async def fake_words(self, path, language=None, model_size=None):
        calls["words"] += 1
        return [{"word": "hello", "start_ms": 0.0, "end_ms": 500.0, "confidence": 0.9}]

    def fake_turns(path, num=None):
        return [SpeakerTurn(0.0, 1.0, "speaker_1")]

    from backend.backends import yamnet_onnx_backend as ym

    monkeypatch.setattr(
        "backend.backends.faster_whisper_backend.FasterWhisperSTTBackend.transcribe_with_words",
        fake_words,
    )
    monkeypatch.setattr("backend.services.diarization.diarize_turns", fake_turns)
    monkeypatch.setattr(ym.yamnet_backend, "load_model", lambda *a, **k: None)
    monkeypatch.setattr(ym.yamnet_backend, "class_names", lambda: ["Speech", "Laughter"])
    monkeypatch.setattr(
        ym.yamnet_backend,
        "score_audio",
        lambda audio, sample_rate: [{"start": 0.0, "end": 0.96, "scores": {0: 0.1, 1: 0.9}}],
    )

    first = await mod.build_capture_words_json(wav)
    assert first is not None and first.exists()
    import json

    doc = json.loads(first.read_text())
    assert doc["text"] == "hello"
    assert doc["words"][0]["speaker_id"] == "speaker_1"
    assert any(w.get("type") == "audio_event" and w["text"] == "laughter" for w in doc["words"])
    # Cache-if-exists: second call must not re-run transcription.
    second = await mod.build_capture_words_json(wav)
    assert second == first
    assert calls["words"] == 1


async def test_build_capture_json_skips_silence(tmp_path):
    import soundfile as sf

    import backend.services.scribe_json as mod

    wav = tmp_path / "quiet.wav"
    sf.write(str(wav), np.zeros(16000, dtype=np.float32), 16000)
    assert await mod.build_capture_words_json(wav) is None


def test_words_json_path_naming(tmp_path):
    assert sj.words_json_path(tmp_path / "abc123.wav").name == "abc123.words.json"
    assert sj.words_json_path(tmp_path / "abc123.mp3").name == "abc123.words.json"
