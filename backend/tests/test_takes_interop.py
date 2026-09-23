"""video-use interop: our Scribe-shaped JSON must pack identically.

Faithful port of the grouping/render rules in video-use's
``helpers/pack_transcripts.py`` (silence >= 0.5 s or speaker change breaks
phrases; audio_event parenthesized; ``speaker_`` prefix stripped; exact
header/line shapes). If this port drifts from upstream, re-check their file
— the contract direction is ours-must-match-theirs.

These tests prove OUR output satisfies THEIR consumer: golden equivalence
on a README-shaped fixture, plus an end-to-end pack of our own
``build_scribe_json`` output.
"""

import re

from backend.services import scribe_json as sj

SILENCE_THRESHOLD = 0.5


def _format_time(seconds: float) -> str:
    return f"{seconds:06.2f}"


def _format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:04.1f}s"


def _group_into_phrases(words: list[dict], silence_threshold: float = SILENCE_THRESHOLD) -> list[dict]:
    """Port of video-use group_into_phrases (pack_transcripts.py)."""
    phrases: list[dict] = []
    current: list[dict] = []
    current_start: float | None = None
    current_speaker: str | None = None
    prev_end: float | None = None

    def flush() -> None:
        nonlocal current, current_start, current_speaker
        if not current:
            return
        parts: list[str] = []
        for w in current:
            raw = (w.get("text") or "").strip()
            if not raw:
                continue
            if w.get("type", "word") == "audio_event" and not raw.startswith("("):
                raw = f"({raw})"
            parts.append(raw)
        if parts:
            text = " ".join(parts)
            for a, b in ((" ,", ","), (" .", "."), (" ?", "?"), (" !", "!")):
                text = text.replace(a, b)
            end_time = current[-1].get("end", current[-1].get("start", current_start or 0.0))
            phrases.append({"start": current_start, "end": end_time, "text": text, "speaker_id": current_speaker})
        current = []
        current_start = None
        current_speaker = None

    for w in words:
        if w.get("type", "word") == "spacing":
            if w.get("start") is not None and w.get("end") is not None and w["end"] - w["start"] >= silence_threshold:
                flush()
            continue
        if w.get("start") is None:
            continue
        speaker = w.get("speaker_id")
        if current_speaker is not None and speaker is not None and speaker != current_speaker:
            flush()
        if prev_end is not None and w["start"] - prev_end >= silence_threshold:
            flush()
        if current_start is None:
            current_start = w["start"]
            current_speaker = speaker
        current.append(w)
        prev_end = w.get("end", w["start"])
    flush()
    return phrases


def _render(name: str, duration: float, phrases: list[dict]) -> str:
    lines = [
        "# Packed transcripts",
        "",
        "Phrase-level, grouped on silences or speaker change.",
        "Use `[start-end]` ranges to address cuts in the EDL.",
        "",
        f"## {name}  (duration: {_format_duration(duration)}, {len(phrases)} phrases)",
    ]
    if not phrases:
        return "\n".join([*lines, "  _no speech detected_", ""])
    for p in phrases:
        spk = str(p.get("speaker_id") or "")
        tag = f" S{spk[len('speaker_') :]}" if spk.startswith("speaker_") else (f" {spk}" if spk else "")
        lines.append(f"  [{_format_time(p['start'])}-{_format_time(p['end'])}]{tag} {p['text']}")
    return "\n".join([*lines, ""])


def _readme_fixture() -> list[dict]:
    """Words behind the README example lines (full first sentence)."""
    bits = [
        ("Ninety", 2.52, 2.9),
        ("percent", 2.95, 3.3),
        ("of", 3.35, 3.5),
        ("what", 3.55, 3.8),
        ("a", 3.85, 4.0),
        ("web", 4.05, 4.3),
        ("agent", 4.35, 4.6),
        ("does", 4.65, 4.85),
        ("is", 4.9, 5.0),
        ("completely", 5.05, 5.2),
        ("wasted.", 5.25, 5.36),
        ("We", 6.08, 6.3),
        ("fixed", 6.4, 6.6),
        ("this.", 6.65, 6.74),
    ]
    return [
        {"text": text, "start": start, "end": end, "type": "word", "speaker_id": "speaker_0"}
        for text, start, end in bits
    ]


def test_readme_shaped_fixture_packs_identically():
    phrases = _group_into_phrases(_readme_fixture())
    assert len(phrases) == 2
    assert phrases[0]["text"] == "Ninety percent of what a web agent does is completely wasted."
    assert phrases[1]["text"] == "We fixed this."
    rendered = _render("C0103", phrases[-1]["end"] - phrases[0]["start"], phrases)
    assert "## C0103  (duration: 4.2s, 2 phrases)" in rendered
    assert "[002.52-005.36] S0 Ninety percent of what a web agent does is completely wasted." in rendered
    assert "[006.08-006.74] S0 We fixed this." in rendered


def test_our_builder_output_packs_without_loss():
    words = [
        {"text": "hey", "start": 0.0, "end": 0.4, "speaker_id": "speaker_1"},
        {"text": "there", "start": 0.5, "end": 0.9, "speaker_id": "speaker_1"},
        {"text": "laughter", "start": 2.0, "end": 2.9, "type": "audio_event"},
    ]
    doc = sj.build_scribe_json(sj.synthesize_spacing(words), [])
    phrases = _group_into_phrases(doc["words"])
    assert len(phrases) == 2
    assert phrases[0]["text"] == "hey there"
    assert "(laughter)" in phrases[1]["text"]
    rendered = _render("cap", 3.0, phrases)
    assert "S1 hey there" in rendered


def test_contract_invariants():
    """Every assumption the packer makes about our JSON, pinned down."""
    words = [
        {"text": "b", "start": 1.0, "end": 1.5, "speaker_id": "speaker_0"},
        {"text": "a", "start": 0.0, "end": 0.5, "speaker_id": "speaker_2"},
        {"text": "cough", "start": 2.0, "end": 2.3, "type": "audio_event"},
    ]
    doc = sj.build_scribe_json(sj.synthesize_spacing(words), [])
    starts = [w["start"] for w in doc["words"]]
    assert starts == sorted(starts)
    for index, word in enumerate(doc["words"][1:], start=1):
        assert word["end"] >= word["start"]
        assert word["start"] >= doc["words"][index - 1]["start"]
    assert {w["type"] for w in doc["words"]} <= {"word", "spacing", "audio_event"}
    for w in doc["words"]:
        if w["type"] == "word":
            assert w.get("speaker_id") is None or re.fullmatch(r"speaker_\d+", w["speaker_id"] or "")
