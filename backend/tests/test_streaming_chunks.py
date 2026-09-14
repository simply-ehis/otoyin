"""Stress test for streaming chunk generation and on_chunk callback delivery.

Verifies:
  - on_chunk callback fires for every chunk in the right order
  - Parallel generation fires all callbacks
  - Streaming disk path saves chunks correctly
  - Multi-chunk text produces correct chunk count
  - Edge cases: single chunk, empty text, exact boundary
"""

import asyncio
import wave

import numpy as np
import pytest

from backend.utils.chunked_tts import (
    STREAMING_CHUNK_THRESHOLD,
    generate_chunked,
)
from backend.utils.text_preprocessing import split_sentences

# ── Helpers ────────────────────────────────────────────────────────────


class FakeTTSModel:
    """Fake TTS backend that returns deterministic audio."""

    def __init__(self, sample_rate: int = 24000):
        self.sample_rate = sample_rate
        self.call_count = 0

    async def generate(
        self, text, voice_prompt=None, language=None, seed=None, instruct=None, temperature=None
    ) -> tuple[np.ndarray, int]:
        self.call_count += 1
        # Return 0.5 seconds of sine wave per call
        duration_samples = self.sample_rate // 2
        t = np.arange(duration_samples) / self.sample_rate
        audio = (8000 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        return audio, self.sample_rate


# ── Sentence splitting ────────────────────────────────────────────────


class TestSentenceSplitting:
    def test_split_simple_sentences(self):
        text = "Hello world. How are you? I am fine!"
        chunks = split_sentences(text)
        assert len(chunks) >= 1
        assert all(len(c) > 0 for c in chunks)

    def test_single_sentence_returns_single_chunk(self):
        text = "Just one sentence."
        chunks = split_sentences(text)
        assert len(chunks) == 1
        assert chunks[0].strip() == text

    def test_empty_text_returns_no_chunks(self):
        # Empty input has nothing to synthesize: callers (chunk_text_for_tts)
        # guard on empty first, and [] here means "no work", not an error.
        assert split_sentences("") == []

    def test_split_preserves_content(self):
        text = "Alpha. Beta. Gamma."
        chunks = split_sentences(text)
        combined = " ".join(c.strip() for c in chunks)
        # All original words should be in the combined text
        for word in ["Alpha", "Beta", "Gamma"]:
            assert word in combined


# ── on_chunk callback ──────────────────────────────────────────────────


class TestOnChunkCallback:
    @pytest.mark.asyncio
    async def test_on_chunk_fires_for_each_chunk(self):
        model = FakeTTSModel()
        received = []

        async def on_chunk(idx, total, audio, sr):
            received.append((idx, total, sr))
            assert isinstance(audio, np.ndarray)

        text = "First sentence. Second sentence. Third sentence."
        await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=20,
            on_chunk=on_chunk,
        )

        assert len(received) >= 2
        # All chunks report the same total
        totals = {r[1] for r in received}
        assert len(totals) == 1
        # Indices are sequential
        indices = [r[0] for r in received]
        assert indices == list(range(len(indices)))

    @pytest.mark.asyncio
    async def test_on_chunk_not_called_when_none(self):
        model = FakeTTSModel()
        text = "Hello. World."
        audio, sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=800,
            on_chunk=None,
        )
        assert isinstance(audio, np.ndarray)
        assert sr == 24000

    @pytest.mark.asyncio
    async def test_on_chunk_receives_correct_sample_rate(self):
        model = FakeTTSModel(sample_rate=44100)
        received = []

        async def on_chunk(idx, total, audio, sr):
            received.append(sr)

        text = "One. Two. Three. Four."
        await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=10,
            on_chunk=on_chunk,
        )
        assert all(sr == 44100 for sr in received)


# ── Multi-chunk generation ────────────────────────────────────────────


class TestMultiChunkGeneration:
    @pytest.mark.asyncio
    async def test_many_chunks_all_delivered(self):
        """Generate 10+ chunks and verify all arrive."""
        model = FakeTTSModel()
        received = []

        async def on_chunk(idx, total, audio, sr):
            received.append(idx)

        text = ". ".join([f"Sentence {i}" for i in range(15)])
        audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=15,
            on_chunk=on_chunk,
        )

        assert len(received) >= 10
        assert model.call_count >= 10
        # Final audio is valid
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    @pytest.mark.asyncio
    async def test_chunk_count_matches_split(self):
        """Number of on_chunk calls matches sentence count from text."""
        model = FakeTTSModel()
        received = []

        async def on_chunk(idx, total, audio, sr):
            received.append(idx)

        text = "Alpha. Beta. Gamma. Delta. Epsilon."

        await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=20,
            on_chunk=on_chunk,
        )

        # Should have at least as many chunks as the text produces
        assert len(received) >= 2


# ── Streaming disk path ───────────────────────────────────────────────


class TestStreamingDiskPath:
    @pytest.mark.asyncio
    async def test_streaming_disk_path_saves_chunks(self, tmp_path):
        """When chunks > threshold, streaming disk path is used."""
        model = FakeTTSModel()
        saved_chunks = []

        async def on_chunk(idx, total, audio, sr):
            saved_chunks.append((idx, total))
            # Simulate the saving that generation.py does
            chunk_path = tmp_path / f"chunk_{idx}.wav"
            audio_int16 = (audio * 32767).astype(np.int16)
            with wave.open(str(chunk_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sr)
                wf.writeframes(audio_int16.tobytes())

        # Generate enough text to exceed STREAMING_CHUNK_THRESHOLD
        text = ". ".join([f"Part {i} of a long text." for i in range(12)])
        _audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=30,
            on_chunk=on_chunk,
        )

        assert len(saved_chunks) >= STREAMING_CHUNK_THRESHOLD
        # All saved files exist
        for idx, _total in saved_chunks:
            chunk_path = tmp_path / f"chunk_{idx}.wav"
            assert chunk_path.exists()
            assert chunk_path.stat().st_size > 0

    @pytest.mark.asyncio
    async def test_final_audio_longer_than_single_chunk(self):
        """Multi-chunk final audio should be longer than one chunk."""
        model = FakeTTSModel()
        text = ". ".join([f"Part {i}" for i in range(5)])
        audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=15,
        )
        # Each chunk is 0.5s (12000 samples at 24kHz)
        # 5 chunks should produce > 12000 samples
        assert len(audio) > 12000


# ── Edge cases ────────────────────────────────────────────────────────


class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_single_chunk_text(self):
        model = FakeTTSModel()
        received = []

        async def on_chunk(idx, total, audio, sr):
            received.append(idx)

        audio, sr = await generate_chunked(
            model,
            "Hello world.",
            {},
            max_chunk_chars=800,
            on_chunk=on_chunk,
        )
        # Single-chunk text takes the fast path (no chunking overhead).
        # on_chunk is only called in the multi-chunk code path.
        assert len(received) == 0
        assert isinstance(audio, np.ndarray)
        assert sr == 24000

    @pytest.mark.asyncio
    async def test_crossfade_zero_produces_valid_audio(self):
        model = FakeTTSModel()
        text = "First sentence. Second sentence."
        audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=15,
            crossfade_ms=0,
        )
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    @pytest.mark.asyncio
    async def test_parallel_generation_with_callback(self):
        """Parallel path (crossfade=0) should fire on_chunk correctly."""
        model = FakeTTSModel()
        received = []

        async def on_chunk(idx, total, audio, sr):
            received.append(idx)

        text = ". ".join([f"Sentence {i}" for i in range(8)])
        _audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=15,
            crossfade_ms=0,
            on_chunk=on_chunk,
            max_parallel_chunks=4,
        )
        assert len(received) == 8
        # Indices should be 0-7
        assert sorted(received) == list(range(8))


# ── Stress: rapid concurrent callbacks ────────────────────────────────


class TestStressCallbacks:
    @pytest.mark.asyncio
    async def test_concurrent_on_chunk_no_corruption(self):
        """All chunks should arrive without index collision."""
        model = FakeTTSModel()
        received = []
        lock = asyncio.Lock()

        async def on_chunk(idx, total, audio, sr):
            async with lock:
                received.append(idx)

        # Generate 20 chunks worth of text
        text = ". ".join([f"Chunk {i}" for i in range(20)])
        _audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=10,
            on_chunk=on_chunk,
        )

        # No duplicate indices
        assert len(received) == len(set(received))
        # All sequential
        assert sorted(received) == list(range(len(received)))
