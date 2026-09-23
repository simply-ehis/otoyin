"""STT word-timestamp fallback: any engine yields Scribe-normalized words."""

import pytest

from backend.services.transcribe import (
    split_segment_proportional,
    transcribe_words_raw,
    transcribe_words_with_fallback,
)


def test_proportional_split_by_chars():
    words = split_segment_proportional("hi you", 0.0, 6.0)
    assert [w["text"] for w in words] == ["hi", "you"]
    assert words[0]["start"] == 0.0
    assert words[-1]["end"] == 6.0
    # "hi" (2 chars) gets half the span of "you" (3 chars): 2.4s vs 3.6s.
    assert words[0]["end"] == pytest.approx(2.4)
    assert words[1]["start"] == pytest.approx(2.4)


def test_proportional_split_degenerate_span():
    words = split_segment_proportional("a b", 1.0, 0.0)
    assert [(w["start"], w["end"]) for w in words] == [(1.0, 1.0), (1.0, 1.0)]


def test_proportional_split_empty():
    assert split_segment_proportional("   ", 0.0, 1.0) == []


class _NativeWordsBackend:
    async def transcribe_with_words(self, path, language=None, model_size=None):
        return [{"word": "hello", "start_ms": 0.0, "end_ms": 500.0, "confidence": 0.9}]


class _SegmentsBackend:
    async def transcribe_with_segments(self, path, language=None, model_size=None):
        return {"text": "hi you", "segments": [{"text": "hi you", "start": 10.0, "end": 16.0}]}


class _MsSegmentsBackend:
    """faster-whisper-shaped segments (milliseconds)."""

    async def transcribe_with_segments(self, path, language=None, model_size=None):
        return {"text": "hi you", "segments": [{"text": "hi you", "start": 10000.0, "end": 16000.0}]}


class _TextOnlyBackend:
    async def transcribe(self, path, language=None, model_size=None):
        return "hello world"


class _DeadBackend:
    async def transcribe_with_words(self, path, language=None, model_size=None):
        raise RuntimeError("no model")

    async def transcribe_with_segments(self, path, language=None, model_size=None):
        raise RuntimeError("no model")

    async def transcribe(self, path, language=None, model_size=None):
        raise RuntimeError("no model")


def _patch_backend(monkeypatch, backend):
    # transcribe_words_raw imports the factory fresh on every call
    # (``from ..backends import get_stt_backend`` inside the function),
    # so the patch target is the source package, not services.transcribe.
    monkeypatch.setattr("backend.backends.get_stt_backend", lambda engine="whisper": backend)
    monkeypatch.setattr("backend.utils.model_lifecycle.lifecycle_manager.mark_model_used", lambda engine: None)


async def test_native_words_preferred(monkeypatch):
    _patch_backend(monkeypatch, _NativeWordsBackend())
    raw, unit, source = await transcribe_words_raw("faster-whisper", "x.wav")
    assert unit == "ms" and source == "native"
    assert raw[0]["word"] == "hello"


async def test_segments_split_proportionally(monkeypatch):
    _patch_backend(monkeypatch, _SegmentsBackend())
    words, source = await transcribe_words_with_fallback("whisper", "x.wav", fallback_to=())
    assert source == "whisper:segments"
    assert [w["text"] for w in words] == ["hi", "you"]
    assert words[0]["start"] == pytest.approx(10.0)
    assert words[-1]["end"] == pytest.approx(16.0)


async def test_ms_segments_converted_to_seconds(monkeypatch):
    import backend.services.transcribe as mod

    _patch_backend(monkeypatch, _MsSegmentsBackend())
    monkeypatch.setattr(mod, "_SEGMENT_UNIT_MS", frozenset({"whisper"}))
    words, _ = await transcribe_words_with_fallback("whisper", "x.wav", fallback_to=())
    assert words[0]["start"] == pytest.approx(10.0)
    assert words[-1]["end"] == pytest.approx(16.0)


async def test_degenerate_span_uses_duration(monkeypatch):
    class _Degenerate(_SegmentsBackend):
        async def transcribe_with_segments(self, path, language=None, model_size=None):
            return {"text": "hi you", "segments": [{"text": "hi you", "start": 0.0, "end": 0.0}]}

    _patch_backend(monkeypatch, _Degenerate())
    words, _ = await transcribe_words_with_fallback("moonshine", "x.wav", duration_s=6.0, fallback_to=())
    assert words[-1]["end"] == pytest.approx(6.0)


async def test_text_only_spread_over_duration(monkeypatch):
    _patch_backend(monkeypatch, _TextOnlyBackend())
    words, source = await transcribe_words_with_fallback("moonshine", "x.wav", duration_s=4.0, fallback_to=())
    assert source == "moonshine:text"
    assert [w["text"] for w in words] == ["hello", "world"]
    assert words[-1]["end"] == pytest.approx(4.0)


async def test_chain_falls_to_next_engine(monkeypatch):

    calls = []

    def fake_factory(engine="whisper"):
        calls.append(engine)
        if engine == "parakeet":
            raise ValueError(f"Unknown STT engine: {engine}")
        return _DeadBackend() if engine == "whisper" else _NativeWordsBackend()

    monkeypatch.setattr("backend.backends.get_stt_backend", fake_factory)
    monkeypatch.setattr("backend.utils.model_lifecycle.lifecycle_manager.mark_model_used", lambda engine: None)
    words, source = await transcribe_words_with_fallback("whisper", "x.wav", fallback_to=("faster-whisper",))
    assert source == "faster-whisper:native"
    assert words[0]["text"] == "hello"
    assert calls[0] == "whisper"


async def test_all_dead_raises(monkeypatch):
    _patch_backend(monkeypatch, _DeadBackend())
    with pytest.raises(RuntimeError):
        await transcribe_words_with_fallback("whisper", "x.wav", fallback_to=())
