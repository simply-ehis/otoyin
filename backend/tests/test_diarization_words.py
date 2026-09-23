"""Word-level speaker merge: intersect word spans with diarization turns.

Pure-function tests (no audio, no models): words carry start/end seconds,
turns carry start/end/speaker. Proves the merge behind Scribe-shaped output.
"""

from backend.services.diarization import SpeakerTurn, align_words_to_speakers


def _w(text, start, end):
    return {"text": text, "start": start, "end": end}


def _turns():
    return [
        SpeakerTurn(start=0.0, end=5.0, speaker="speaker_0"),
        SpeakerTurn(start=5.0, end=10.0, speaker="speaker_1"),
    ]


def test_words_inside_turns_take_turn_speakers():
    words = [_w("hello", 1.0, 1.4), _w("world", 6.0, 6.5)]
    out = align_words_to_speakers(words, _turns())
    assert [w["speaker"] for w in out] == ["speaker_0", "speaker_1"]


def test_straddling_word_goes_to_majority_overlap():
    # 4.0-6.0 overlaps turn0 by 1s, turn1 by 1s -> tie goes to earliest.
    # 4.5-6.5 overlaps turn1 (1.5s) more than turn0 (0.5s).
    words = [_w("tie", 4.0, 6.0), _w("one", 4.5, 6.5)]
    out = align_words_to_speakers(words, _turns())
    assert out[0]["speaker"] == "speaker_0"
    assert out[1]["speaker"] == "speaker_1"


def test_gap_word_inherits_nearest_turn():
    # 10.5-11.0 sits past all turns -> nearest is turn1 (ends at 10.0).
    words = [_w("after", 10.5, 11.0)]
    out = align_words_to_speakers(words, _turns())
    assert out[0]["speaker"] == "speaker_1"


def test_no_turns_leaves_speaker_unset():
    out = align_words_to_speakers([_w("hi", 1.0, 1.5)], [])
    assert out[0].get("speaker") is None


def test_empty_words_returns_empty():
    assert align_words_to_speakers([], _turns()) == []


def test_inputs_not_mutated():
    words = [_w("hi", 1.0, 1.5)]
    align_words_to_speakers(words, _turns())
    assert "speaker" not in words[0]
