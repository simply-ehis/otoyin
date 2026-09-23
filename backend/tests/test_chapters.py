"""Auto-chapters: segment a take on silence/music/applause boundaries.

Pure-function tests over Scribe-shaped words: long silences split,
applause runs close the chapter, music runs open a labeled break.
"""

from backend.services import chapters as ch


def _word(text, start, end):
    return {"text": text, "start": start, "end": end, "type": "word"}


def test_silence_gap_splits_chapters():
    words = [_word("a", 0.0, 1.0), _word("b", 10.0, 11.0)]
    out = ch.build_chapters(words, duration=12.0)
    assert len(out) == 2
    assert out[0]["end"] == 1.0
    assert out[1]["start"] == 10.0
    assert out[0]["title"] == "a"


def test_applause_closes_chapter_with_label():
    words = [
        _word("thanks", 0.0, 1.0),
        {"text": "applause", "start": 1.5, "end": 4.0, "type": "audio_event"},
        _word("next", 5.0, 6.0),
    ]
    out = ch.build_chapters(words, duration=7.0)
    assert len(out) == 2
    assert out[0]["end"] == 4.0
    assert "Applause" in out[0]["title"] or "applause" in out[0]["title"].lower()


def test_music_run_becomes_labeled_break():
    words = [
        _word("intro", 0.0, 1.0),
        {"text": "music", "start": 2.0, "end": 15.0, "type": "audio_event"},
        _word("back", 16.0, 17.0),
    ]
    out = ch.build_chapters(words, duration=18.0, min_music_s=5.0)
    titles = [c["title"] for c in out]
    assert any("usic" in t for t in titles)


def test_short_take_stays_single_chapter():
    words = [_word("a", 0.0, 0.5), _word("b", 0.6, 1.0)]
    out = ch.build_chapters(words, duration=1.5)
    assert len(out) == 1
    assert out[0] == {"index": 0, "title": "a b", "start": 0.0, "end": 1.5}


def test_empty_words_gives_full_span_chapter():
    out = ch.build_chapters([], duration=10.0)
    assert out == [{"index": 0, "title": "", "start": 0.0, "end": 10.0}]
