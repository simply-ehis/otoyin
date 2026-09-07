"""
Chunked TTS generation utilities.

Splits long text into sentence-boundary chunks, generates audio per-chunk
via any TTSBackend, and concatenates with crossfade.  All logic is
engine-agnostic — it wraps the standard ``TTSBackend.generate()`` interface.

Short text (≤ max_chunk_chars) uses the single-shot fast path with zero
overhead.
"""

import contextlib
import logging
import re
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from .text_preprocessing import normalize_text, split_sentences

logger = logging.getLogger("otoyin.chunked-tts")

# Default chunk size in characters.  Can be overridden per-request via
# the ``max_chunk_chars`` field on GenerationRequest.
DEFAULT_MAX_CHUNK_CHARS = 800

# When the number of chunks exceeds this threshold, switch from in-memory
# concatenation to a streaming disk-based path to cap peak VRAM / RAM.
# Each chunk is written to a temp WAV as soon as it is generated; only
# the crossfade tail buffer stays in memory.
STREAMING_CHUNK_THRESHOLD = 5

# Common abbreviations that should NOT be treated as sentence endings.
# Lowercase for case-insensitive matching.
_ABBREVIATIONS = frozenset(
    {
        "mr",
        "mrs",
        "ms",
        "dr",
        "prof",
        "sr",
        "jr",
        "st",
        "ave",
        "blvd",
        "inc",
        "ltd",
        "corp",
        "dept",
        "est",
        "approx",
        "vs",
        "etc",
        "e.g",
        "i.e",
        "a.m",
        "p.m",
        "u.s",
        "u.s.a",
        "u.k",
    }
)

# Paralinguistic tags used by Chatterbox Turbo.  The splitter must never
# cut inside one of these.
_PARA_TAG_RE = re.compile(r"\[[^\]]*\]")


def split_text_into_chunks(
    text: str,
    max_chars: int = DEFAULT_MAX_CHUNK_CHARS,
    language: str = "en",
) -> list[str]:
    """Split *text* at natural boundaries into chunks of at most *max_chars*.

    Uses spaCy sentencizer for English, regex fallback for other languages.
    Priority: sentence-end → clause boundary → whitespace → hard cut.

    Paralinguistic tags like ``[laugh]`` are treated as atomic and will not
    be split across chunks.
    """
    text = normalize_text(text)
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    # Use spaCy/regex sentence splitting for clean sentence boundaries
    sentences = split_sentences(text, language)

    # If we got meaningful sentence splits, chunk them by max_chars
    if len(sentences) > 1:
        chunks: list[str] = []
        current = ""
        for sent in sentences:
            if len(current) + len(sent) + 1 <= max_chars:
                current = f"{current} {sent}".strip() if current else sent
            else:
                if current:
                    chunks.append(current)
                current = sent
        if current:
            chunks.append(current)
        return chunks

    # Fallback: regex-based splitting for long text without clear sentences
    chunks = []
    remaining = text

    while remaining:
        remaining = remaining.lstrip()
        if not remaining:
            break
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        segment = remaining[:max_chars]

        # Try to split at the last real sentence ending
        split_pos = _find_last_sentence_end(segment)
        if split_pos == -1:
            split_pos = _find_last_clause_boundary(segment)
        if split_pos == -1:
            split_pos = segment.rfind(" ")
        if split_pos == -1:
            # Absolute fallback: hard cut but avoid splitting inside a tag
            split_pos = _safe_hard_cut(segment, max_chars)

        chunk = remaining[: split_pos + 1].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[split_pos + 1 :]

    return chunks


def _find_last_sentence_end(text: str) -> int:
    """Return the index of the last sentence-ending punctuation in *text*.

    Skips periods that follow common abbreviations (``Dr.``, ``Mr.``, etc.)
    and periods inside bracket tags (``[laugh]``).  Also handles CJK
    sentence-ending punctuation (``。！？``).
    """
    tag_spans = _precompute_tag_spans(text)
    best = -1
    # ASCII sentence ends
    for m in re.finditer(r"[.!?](?:\s|$)", text):
        pos = m.start()
        char = text[pos]
        # Skip periods after abbreviations
        if char == ".":
            # Walk backwards to find the preceding word
            word_start = pos - 1
            while word_start >= 0 and text[word_start].isalpha():
                word_start -= 1
            word = text[word_start + 1 : pos].lower()
            if word in _ABBREVIATIONS:
                continue
            # Skip decimal numbers (digit immediately before the period)
            if word_start >= 0 and text[word_start].isdigit():
                continue
        # Skip if we're inside a bracket tag
        if _spans_contain(tag_spans, pos):
            continue
        best = pos
    # CJK sentence-ending punctuation
    for m in re.finditer(r"[\u3002\uff01\uff1f]", text):
        if m.start() > best:
            best = m.start()
    return best


def _find_last_clause_boundary(text: str) -> int:
    """Return the index of the last clause-boundary punctuation."""
    tag_spans = _precompute_tag_spans(text)
    best = -1
    for m in re.finditer(r"[;:,\u2014](?:\s|$)", text):
        pos = m.start()
        # Skip if inside a bracket tag
        if _spans_contain(tag_spans, pos):
            continue
        best = pos
    return best


def _precompute_tag_spans(text: str) -> list[tuple[int, int]]:
    """Pre-compute bracket tag spans for a text block, avoiding repeated finditer."""
    return [(m.start(), m.end()) for m in _PARA_TAG_RE.finditer(text)]


def _spans_contain(spans: list[tuple[int, int]], pos: int) -> bool:
    """Check if *pos* falls inside any pre-computed tag span."""
    return any(start < pos < end for start, end in spans)


def _inside_bracket_tag(text: str, pos: int) -> bool:
    """Return True if *pos* falls inside a ``[...]`` tag."""
    return _spans_contain(_precompute_tag_spans(text), pos)


def _safe_hard_cut(segment: str, max_chars: int) -> int:
    """Find a hard-cut position that doesn't split a ``[tag]``."""
    cut = max_chars - 1
    # Check if the cut falls inside a bracket tag; if so, move before it
    for m in _PARA_TAG_RE.finditer(segment):
        if m.start() < cut < m.end():
            return m.start() - 1 if m.start() > 0 else cut
    return cut


def concatenate_audio_chunks(
    chunks: list[np.ndarray],
    sample_rate: int,
    crossfade_ms: int = 50,
) -> np.ndarray:
    """Concatenate audio arrays with a short crossfade to eliminate clicks.

    Each chunk is expected to be a 1-D float32 ndarray at *sample_rate* Hz.
    Pre-allocates the full output buffer to avoid repeated concatenation copies.
    """
    if not chunks:
        return np.array([], dtype=np.float32)
    if len(chunks) == 1:
        return chunks[0]

    crossfade_samples = int(sample_rate * crossfade_ms / 1000)

    # Pre-compute prefix lengths once — O(n) instead of the O(n²)
    # sum(len(chunks[j]) for j in range(i)) recomputed inside the loop.
    prefix = [0]
    for c in chunks:
        prefix.append(prefix[-1] + len(c))
    total_overlap = 0
    for i in range(1, len(chunks)):
        overlap = min(crossfade_samples, prefix[i], len(chunks[i]))
        total_overlap += overlap
    out_len = prefix[-1] - total_overlap
    out = np.empty(max(1, out_len), dtype=np.float32)

    pos = 0
    # Copy first chunk
    c0 = np.asarray(chunks[0], dtype=np.float32)
    n = len(c0)
    out[pos : pos + n] = c0
    pos += n

    for chunk in chunks[1:]:
        chunk_f = np.asarray(chunk, dtype=np.float32)
        if len(chunk_f) == 0:
            continue
        overlap = min(crossfade_samples, pos, len(chunk_f))
        if overlap > 0:
            fade_out = np.linspace(1.0, 0.0, overlap, dtype=np.float32)
            fade_in = np.linspace(0.0, 1.0, overlap, dtype=np.float32)
            out[pos - overlap : pos] = out[pos - overlap : pos] * fade_out + chunk_f[:overlap] * fade_in
            non_overlap = len(chunk_f) - overlap
            if non_overlap > 0:
                out[pos : pos + non_overlap] = chunk_f[overlap:]
                pos += non_overlap
        else:
            out[pos : pos + len(chunk_f)] = chunk_f
            pos += len(chunk_f)

    return out[:pos]


# ---------------------------------------------------------------------------
# Streaming (disk-backed) concatenation for long texts
# ---------------------------------------------------------------------------


class _StreamingConcatenator:
    """Disk-backed chunk accumulator that avoids holding all audio in RAM.

    Each :meth:`add_chunk` writes the non-overlapping tail of the chunk to a
    temporary WAV file, keeping only the crossfade overlap region in memory.
    When :meth:`finalize` is called the full result is read back as a single
    float32 array.

    Parameters
    ----------
    sample_rate : int
        Audio sample rate in Hz.
    crossfade_ms : int
        Crossfade duration in milliseconds.  ``0`` disables crossfading.
    """

    def __init__(self, sample_rate: int, crossfade_ms: int = 50) -> None:
        self._sample_rate = sample_rate
        self._crossfade_samples = int(sample_rate * crossfade_ms / 1000)
        self._total_samples = 0
        # Tail buffer: last ``crossfade_samples`` of previously written audio.
        # Used to blend with the head of the next chunk.
        self._tail: np.ndarray | None = None
        # Temporary WAV that accumulates the non-overlapping parts.
        # Create a named temp file and immediately close the Python file
        # object so only the SoundFile holds the handle (avoids Windows
        # deletion errors where NamedTemporaryFile keeps the fd open).
        _tmp = tempfile.NamedTemporaryFile(  # noqa: SIM115
            suffix=".wav", delete=False, prefix="21labs_chunk_"
        )
        self._tmp_path = _tmp.name
        _tmp.close()
        self._writer: sf.SoundFile | None = sf.SoundFile(
            self._tmp_path,
            mode="w",
            samplerate=sample_rate,
            channels=1,
            format="WAV",
            subtype="FLOAT",
        )

    # -- public API -------------------------------------------------------

    def add_chunk(self, audio: np.ndarray) -> None:
        """Append *audio* (1-D float32) to the stream, applying crossfade."""
        audio = np.asarray(audio, dtype=np.float32)
        if audio.size == 0:
            return

        cf = self._crossfade_samples

        if cf == 0 or self._tail is None:
            # First chunk, or hard-cut mode: write the whole thing.
            # If hard-cut, just append raw.
            if self._tail is not None and cf == 0:
                # Hard cut: flush tail then append the new chunk.
                self._writer.write(self._tail.reshape(-1, 1))
                self._total_samples += len(self._tail)
            self._tail = audio.copy()
            return

        # Crossfade region: blend tail of previous with head of new.
        overlap = min(cf, len(self._tail), len(audio))

        fade_out = np.linspace(1.0, 0.0, overlap, dtype=np.float32)
        fade_in = np.linspace(0.0, 1.0, overlap, dtype=np.float32)
        blended = self._tail[-overlap:] * fade_out + audio[:overlap] * fade_in

        # Write: (1) the non-overlapping prefix of tail,
        #        (2) the blended crossfade region.
        prefix = self._tail[:-overlap] if overlap < len(self._tail) else np.array([], dtype=np.float32)
        if prefix.size > 0:
            self._writer.write(prefix.reshape(-1, 1))
            self._total_samples += len(prefix)
        self._writer.write(blended.reshape(-1, 1))
        self._total_samples += overlap

        # Keep the tail of the *new* chunk (post-crossfade) as the next tail.
        remainder = audio[overlap:]
        self._tail = remainder.copy() if remainder.size > 0 else np.array([], dtype=np.float32)

    def finalize(self) -> np.ndarray:
        """Flush the remaining tail to disk, close the file, return the full audio."""
        if self._writer is not None:
            # Flush the final tail buffer.
            if self._tail is not None and self._tail.size > 0:
                self._writer.write(self._tail.reshape(-1, 1))
                self._total_samples += len(self._tail)
            self._writer.close()
            self._writer = None

        # Read back the full result.
        audio, _ = sf.read(self._tmp_path, dtype="float32", always_2d=False)
        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim > 1:
            audio = audio.ravel()

        # Clean up temp file.
        with contextlib.suppress(OSError):
            Path(self._tmp_path).unlink(missing_ok=True)

        return audio

    def __del__(self) -> None:
        # Best-effort cleanup if finalize was never called.
        if self._writer is not None:
            with contextlib.suppress(Exception):
                self._writer.close()
        with contextlib.suppress(OSError, AttributeError):
            Path(self._tmp_path).unlink(missing_ok=True)


async def generate_chunked(
    backend,
    text: str,
    voice_prompt: dict,
    language: str = "en",
    seed: int | None = None,
    instruct: str | None = None,
    temperature: float | None = None,
    max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
    crossfade_ms: int = 50,
    trim_fn=None,
    max_parallel_chunks: int = 4,
    on_chunk=None,
) -> tuple[np.ndarray, int]:
    """Generate audio with automatic chunking for long text.

    For text shorter than *max_chunk_chars* this is a thin wrapper around
    ``backend.generate()`` with zero overhead.

    For longer text the input is split at natural sentence boundaries,
    each chunk is generated independently, optionally trimmed (useful for
    Chatterbox engines that hallucinate trailing noise), and the results
    are concatenated with a crossfade (or hard cut if *crossfade_ms* is 0).

    When *crossfade_ms* is 0 (hard cut), chunks are generated in parallel
    using a bounded semaphore — each chunk is independent so there is no
    data dependency.  This can reduce wall-clock latency by up to
    ``max_parallel_chunks``× for multi-chunk text.

    Parameters
    ----------
    backend : TTSBackend
        Any backend implementing the ``generate()`` protocol.
    text : str
        Input text (may be arbitrarily long).
    voice_prompt, language, seed, instruct
        Forwarded to ``backend.generate()`` verbatim.
    max_chunk_chars : int
        Maximum characters per chunk (default 800).
    crossfade_ms : int
        Crossfade duration in milliseconds between chunks.  0 for a hard
        cut with no overlap (default 50).
    trim_fn : callable | None
        Optional ``(audio, sample_rate) -> audio`` post-processing
        function applied to each chunk before concatenation (e.g.
        ``trim_tts_output`` for Chatterbox engines).
    max_parallel_chunks : int
        Maximum concurrent chunk generations when crossfade_ms is 0.
        Set to 1 to disable parallelism.  Ignored when crossfade_ms > 0.
    on_chunk : callable | None
        Optional ``async def on_chunk(index, total, audio, sample_rate)``
        callback invoked after each chunk is generated (before concatenation).
        Used for streaming playback — the caller can save/emit each chunk
        immediately instead of waiting for the full assembly.

    Returns
    -------
    (audio, sample_rate) : Tuple[np.ndarray, int]
    """
    import asyncio

    chunks = split_text_into_chunks(text, max_chunk_chars, language)

    if len(chunks) <= 1:
        # Short text — single-shot fast path
        audio, sample_rate = await backend.generate(
            text,
            voice_prompt,
            language,
            seed,
            instruct,
            temperature,
        )
        if trim_fn is not None:
            audio = trim_fn(audio, sample_rate)
        return audio, sample_rate

    # Long text — chunked generation
    logger.info(
        "Splitting %d chars into %d chunks (max %d chars each, crossfade=%dms)",
        len(text),
        len(chunks),
        max_chunk_chars,
        crossfade_ms,
    )

    parallel = crossfade_ms == 0 and max_parallel_chunks > 1

    if parallel:
        # ----- Parallel path: dispatch all chunks concurrently -----
        # When crossfade is 0 (hard cut), chunks are independent — no
        # overlap blending means there is no data dependency between them.
        # A semaphore bounds the number of concurrent GPU/CPU inferences
        # to avoid OOM on resource-constrained devices.
        semaphore = asyncio.Semaphore(max_parallel_chunks)

        async def _gen_one(idx: int, chunk_text: str) -> tuple[int, np.ndarray, int]:
            chunk_seed = (seed + idx) if seed is not None else None
            async with semaphore:
                logger.info(
                    "Generating chunk %d/%d (%d chars) [parallel]",
                    idx + 1,
                    len(chunks),
                    len(chunk_text),
                )
                chunk_audio, chunk_sr = await backend.generate(
                    chunk_text,
                    voice_prompt,
                    language,
                    chunk_seed,
                    instruct,
                    temperature,
                )
            if trim_fn is not None:
                chunk_audio = trim_fn(chunk_audio, chunk_sr)
            return idx, np.asarray(chunk_audio, dtype=np.float32), chunk_sr

        tasks = [_gen_one(i, ct) for i, ct in enumerate(chunks)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Check for errors — if any chunk failed, surface the first one.
        audio_chunks: list[np.ndarray] = [None] * len(chunks)  # type: ignore[list-item]
        sample_rate: int | None = None
        for r in results:
            if isinstance(r, BaseException):
                raise r
            idx, chunk_audio, chunk_sr = r
            audio_chunks[idx] = chunk_audio
            if sample_rate is None:
                sample_rate = chunk_sr
            if on_chunk is not None:
                await on_chunk(idx, len(chunks), chunk_audio, chunk_sr)

        audio = concatenate_audio_chunks(audio_chunks, sample_rate, crossfade_ms=0)  # type: ignore[arg-type]
        return audio, sample_rate

    # ----- Sequential path: crossfade > 0 or max_parallel_chunks == 1 -----
    use_streaming = len(chunks) > STREAMING_CHUNK_THRESHOLD and crossfade_ms > 0
    if use_streaming:
        # Streaming path: write each chunk to disk immediately so peak
        # memory stays bounded (only the crossfade tail buffer + one
        # chunk are live at any time).
        logger.info(
            "Using streaming disk concatenation (%d chunks > threshold %d)",
            len(chunks),
            STREAMING_CHUNK_THRESHOLD,
        )
        concat: _StreamingConcatenator | None = None
        sample_rate: int | None = None

        for i, chunk_text in enumerate(chunks):
            logger.info(
                "Generating chunk %d/%d (%d chars)",
                i + 1,
                len(chunks),
                len(chunk_text),
            )
            chunk_seed = (seed + i) if seed is not None else None

            chunk_audio, chunk_sr = await backend.generate(
                chunk_text,
                voice_prompt,
                language,
                chunk_seed,
                instruct,
                temperature,
            )
            if trim_fn is not None:
                chunk_audio = trim_fn(chunk_audio, chunk_sr)

            if sample_rate is None:
                sample_rate = chunk_sr
                concat = _StreamingConcatenator(sample_rate, crossfade_ms)
            assert concat is not None
            chunk_f32 = np.asarray(chunk_audio, dtype=np.float32)
            concat.add_chunk(chunk_f32)
            if on_chunk is not None:
                await on_chunk(i, len(chunks), chunk_f32, chunk_sr)

        assert concat is not None
        assert sample_rate is not None
        audio = concat.finalize()
        return audio, sample_rate

    # In-memory path: 5 or fewer chunks, or crossfade_ms == 0.
    audio_chunks: list[np.ndarray] = []
    sample_rate: int | None = None

    for i, chunk_text in enumerate(chunks):
        logger.info(
            "Generating chunk %d/%d (%d chars)",
            i + 1,
            len(chunks),
            len(chunk_text),
        )
        chunk_seed = (seed + i) if seed is not None else None

        chunk_audio, chunk_sr = await backend.generate(
            chunk_text,
            voice_prompt,
            language,
            chunk_seed,
            instruct,
            temperature,
        )
        if trim_fn is not None:
            chunk_audio = trim_fn(chunk_audio, chunk_sr)

        chunk_f32 = np.asarray(chunk_audio, dtype=np.float32)
        audio_chunks.append(chunk_f32)
        if sample_rate is None:
            sample_rate = chunk_sr
        if on_chunk is not None:
            await on_chunk(i, len(chunks), chunk_f32, chunk_sr)

    audio = concatenate_audio_chunks(audio_chunks, sample_rate, crossfade_ms=crossfade_ms)
    return audio, sample_rate
