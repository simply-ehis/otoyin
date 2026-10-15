"""
STT (Speech-to-Text) module - delegates to backend abstraction layer.
"""

import logging

from ..backends import STTBackend, get_stt_backend

logger = logging.getLogger(__name__)


def get_whisper_model() -> STTBackend:
    """
    Get STT backend instance.

    Returns:
        STT backend instance
    """
    return get_stt_backend()


def unload_whisper_model():
    """Unload Whisper model to free memory."""
    backend = get_stt_backend()
    backend.unload_model()


async def transcribe_via_cloud_stt(audio_path: str, language: str | None = None) -> str:
    """Transcribe ``audio_path`` using the configured BYOK cloud STT provider.

    Raises ``LookupError`` if no cloud provider is configured so the caller can
    surface a clear error.
    """
    from .cloud_provider import transcribe_via_cloud

    return transcribe_via_cloud(audio_path, language=language, domain="stt")


# Segment timestamp units per engine. faster-whisper emits segments in
# milliseconds (``seg.start * 1000``); every other engine uses seconds.
# Explicit map — never guess from magnitude.
_SEGMENT_UNIT_MS = frozenset({"faster-whisper"})


def split_segment_proportional(text: str, start_s: float, end_s: float) -> list[dict]:
    """Split segment text into words spread proportionally over [start, end].

    Words share the span by character length (same approach as the subtitle
    fallback). Zero/negative spans collapse every word onto ``start_s``.
    Output is Scribe-normalized ``{text, start, end}`` seconds.
    """
    tokens = [t for t in text.split() if t]
    if not tokens:
        return []
    if end_s <= start_s:
        return [{"text": t, "start": start_s, "end": start_s} for t in tokens]
    total_chars = sum(len(t) for t in tokens)
    if total_chars <= 0:
        return [{"text": t, "start": start_s, "end": end_s} for t in tokens]
    words = []
    cursor = start_s
    span = end_s - start_s
    for index, token in enumerate(tokens):
        share = span * len(token) / total_chars
        word_end = end_s if index == len(tokens) - 1 else cursor + share
        words.append({"text": token, "start": cursor, "end": word_end})
        cursor = word_end
    return words


def _audio_duration_s(audio_path: str) -> float | None:
    """Audio duration in seconds, or None when unreadable."""
    try:
        import soundfile as sf

        info = sf.info(audio_path)
        if info.samplerate > 0:
            return info.frames / float(info.samplerate)
    except Exception:
        logger.debug("suppressed exception in transcribe.py:75", exc_info=True)
        return None
    return None


async def transcribe_words_raw(
    engine: str,
    audio_path: str,
    language: str | None = None,
    model_size: str | None = None,
    duration_s: float | None = None,
) -> tuple[list[dict], str, str]:
    """Word timestamps for ANY STT engine: ``(words, unit, source)``.

    Chain per engine: native ``transcribe_with_words`` when the backend has
    it, else segment text split proportionally over each segment span
    (degenerate ``0/0`` spans fall back to the full audio duration), else
    plain-text transcription spread over the duration. ``unit`` is ``ms``
    (faster-whisper native) or ``s``; ``source`` is ``native``,
    ``segments``, or ``text``. Raises ``RuntimeError`` when nothing works.
    """
    import logging

    from ..backends import get_stt_backend
    from ..utils.model_lifecycle import lifecycle_manager

    logger = logging.getLogger(__name__)
    backend = get_stt_backend(engine)
    lifecycle_manager.mark_model_used(engine)

    transcribe_words = getattr(backend, "transcribe_with_words", None)
    if callable(transcribe_words):
        try:
            raw = await transcribe_words(str(audio_path), language, model_size)
            if raw:
                unit = "ms" if any(isinstance(w, dict) and "start_ms" in w for w in raw) else "s"
                return list(raw), unit, "native"
        except Exception as exc:
            logger.debug("Native word timestamps failed for %s: %s", engine, exc)

    segments_fn = getattr(backend, "transcribe_with_segments", None)
    segments: list[dict] = []
    if callable(segments_fn):
        try:
            result = await segments_fn(str(audio_path), language, model_size)
            if isinstance(result, dict):
                segments = [s for s in result.get("segments", []) if isinstance(s, dict)]
        except Exception as exc:
            logger.debug("Segment transcription failed for %s: %s", engine, exc)

    if segments:
        to_seconds = 0.001 if engine in _SEGMENT_UNIT_MS else 1.0
        words: list[dict] = []
        for segment in segments:
            text = (segment.get("text") or "").strip()
            if not text:
                continue
            start = float(segment.get("start", 0.0) or 0.0) * to_seconds
            end = float(segment.get("end", segment.get("start", 0.0)) or 0.0) * to_seconds
            if end <= start and start == 0.0:
                # Degenerate span (moonshine/qwen single segment): spread the
                # words over the full audio duration instead.
                span = duration_s if duration_s and duration_s > 0 else _audio_duration_s(str(audio_path))
                if span and span > 0:
                    end = span
            words.extend(split_segment_proportional(text, start, end))
        if words:
            return words, "s", "segments"

    transcribe_fn = getattr(backend, "transcribe", None)
    if callable(transcribe_fn):
        try:
            text = await transcribe_fn(str(audio_path), language, model_size)
            if isinstance(text, str) and text.strip():
                span = duration_s if duration_s and duration_s > 0 else _audio_duration_s(str(audio_path))
                words = split_segment_proportional(text.strip(), 0.0, span or 0.0)
                if words:
                    return words, "s", "text"
        except Exception as exc:
            logger.debug("Plain transcription failed for %s: %s", engine, exc)

    raise RuntimeError(f"Engine '{engine}' produced no usable words for {audio_path}")


async def transcribe_words_with_fallback(
    engine: str,
    audio_path: str,
    language: str | None = None,
    model_size: str | None = None,
    duration_s: float | None = None,
    fallback_to: tuple[str, ...] = ("faster-whisper",),
) -> tuple[list[dict], str]:
    """Normalized ``{text, start, end}`` seconds + source, any engine.

    Tries ``engine`` first, then each of ``fallback_to`` in order. ``model_size``
    follows faster-whisper naming; engines that do not recognize it skip via
    exception and the chain continues. Raises ``RuntimeError`` when every
    candidate fails.
    """
    import logging

    logger = logging.getLogger(__name__)
    candidates = [engine] + [f for f in fallback_to if f != engine]
    last_error: Exception | None = None
    for candidate in candidates:
        try:
            raw, unit, source = await transcribe_words_raw(candidate, audio_path, language, model_size, duration_s)
            words = []
            for item in raw:
                text = (item.get("word", item.get("text", "")) or "").strip()
                if not text:
                    continue
                if unit == "ms":
                    start = float(item.get("start_ms", 0.0)) / 1000.0
                    end = float(item.get("end_ms", start * 1000.0)) / 1000.0
                else:
                    start = float(item.get("start", 0.0))
                    end = float(item.get("end", start))
                words.append({"text": text, "start": start, "end": end})
            if words:
                return words, f"{candidate}:{source}"
        except Exception as exc:
            last_error = exc
            logger.debug("Word transcription failed for %s: %s", candidate, exc)
    raise RuntimeError(f"No STT engine produced words for {audio_path}: {last_error}")
