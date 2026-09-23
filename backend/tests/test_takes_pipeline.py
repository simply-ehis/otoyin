"""Takes pipeline integration: words -> speakers -> events -> JSON -> chapters.

Exercises slices 1-7 together with stubbed models (no audio, no weights):
faster-whisper-style ms words, Resemblyzer-style turns, YAMNet-style
frames flow through normalize -> attach -> events -> build -> chapters,
and the result satisfies the video-use interop contract end to end.
"""

from backend.services import chapters as ch_mod, scribe_json as sj
from backend.services.diarization import SpeakerTurn


def _pipeline(num_speakers=None):
    raw_words = [
        {"word": "hello", "start_ms": 0.0, "end_ms": 400.0, "confidence": 0.9},
        {"word": "there", "start_ms": 500.0, "end_ms": 900.0, "confidence": 0.8},
        {"word": "listen", "start_ms": 8000.0, "end_ms": 8400.0, "confidence": 0.9},
    ]
    turns = [
        SpeakerTurn(start=0.0, end=2.0, speaker="speaker_0"),
        SpeakerTurn(start=7.5, end=10.0, speaker="speaker_1"),
    ]
    frames = [
        {"start": 2.0, "end": 2.96, "scores": {13: 0.85, 0: 0.05}},
        {"start": 2.48, "end": 3.44, "scores": {13: 0.75, 0: 0.1}},
    ]
    names = ["Speech"] * 13 + ["Laughter"] + ["x"] * 507

    words = sj.normalize_words(raw_words, unit="ms")
    words = sj.attach_speakers(words, turns)
    words = sj.synthesize_spacing(words)
    events = sj.merge_event_tokens(sj.events_from_scores(frames, names, threshold=0.5))
    doc = sj.build_scribe_json(words, events)
    duration = max(w["end"] for w in doc["words"])
    chapters = ch_mod.build_chapters(doc["words"], duration)
    return doc, chapters


def test_pipeline_produces_coherent_pack():
    doc, _chapters = _pipeline()
    assert doc["text"] == "hello there listen"
    speakers = [w["speaker_id"] for w in doc["words"] if w["type"] == "word"]
    assert speakers == ["speaker_0", "speaker_0", "speaker_1"]
    events = [w for w in doc["words"] if w["type"] == "audio_event"]
    assert len(events) == 1
    assert events[0]["text"] == "laughter"
    assert 2.0 <= events[0]["start"] < events[0]["end"] <= 3.44


def test_pipeline_chapters_split_on_gap():
    doc, chapters = _pipeline()
    assert len(chapters) == 2
    assert chapters[0]["title"] == "hello there"
    assert chapters[1]["title"] == "listen"
    assert chapters[0]["end"] <= chapters[1]["start"]
    assert chapters[-1]["end"] == max(w["end"] for w in doc["words"])


def test_pipeline_output_satisfies_interop_contract():
    doc, _ = _pipeline()
    starts = [w["start"] for w in doc["words"]]
    assert starts == sorted(starts)
    assert {w["type"] for w in doc["words"]} <= {"word", "spacing", "audio_event"}
    assert all("speaker_id" in w or w["type"] == "audio_event" for w in doc["words"])
    for w in doc["words"]:
        assert w["end"] >= w["start"] >= 0
