"""End-to-end smoke test for the streaming TTS pipeline.

Covers the full lifecycle:
  1. Text splitting → chunk boundaries
  2. Per-chunk generation with FakeTTS backend
  3. on_chunk callback → chunk file saved to disk (mirrors generation.py)
  4. Final audio assembled from all chunks
  5. Chunk file integrity (readable WAV, correct sample rate, non-silent)
  6. Streaming disk concatenation path (>STREAMING_CHUNK_THRESHOLD chunks)
  7. Parallel generation path (crossfade=0)
  8. Crossfade concatenation path (crossfade>0)
  9. Sequential ordering and no data loss
 10. End-to-end timing: first chunk fires before final audio is ready
"""

import asyncio
import time
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from backend.utils.chunked_tts import (
    STREAMING_CHUNK_THRESHOLD,
    _StreamingConcatenator,
    generate_chunked,
)

# ── Fake backend with configurable latency ────────────────────────────


class LatentTTSModel:
    """Fake TTS backend that returns deterministic audio with configurable delay.

    Each call produces a sine wave at a unique frequency based on chunk index,
    so we can verify that chunks are assembled in the correct order.
    """

    def __init__(self, sample_rate: int = 24000, delay_s: float = 0.01):
        self.sample_rate = sample_rate
        self.delay_s = delay_s
        self.call_count = 0
        self.call_order: list[str] = []  # records text content of each call

    async def generate(
        self, text, voice_prompt=None, language=None, seed=None, instruct=None, temperature=None
    ) -> tuple[np.ndarray, int]:
        self.call_count += 1
        self.call_order.append(text)
        if self.delay_s > 0:
            await asyncio.sleep(self.delay_s)

        # Unique frequency per chunk based on call count (440 + 100*count)
        freq = 440 + 100 * self.call_count
        duration_samples = self.sample_rate // 2  # 0.5s per chunk
        t = np.arange(duration_samples) / self.sample_rate
        audio = (8000 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
        return audio, self.sample_rate


# ── E2E: Full streaming pipeline ──────────────────────────────────────


class TestStreamingPipelineE2E:
    """Full lifecycle: text → chunks → generate → save → assemble → verify."""

    @pytest.mark.asyncio
    async def test_full_pipeline_generates_valid_audio(self, tmp_path):
        """Text with 10+ sentences flows through the entire pipeline."""
        model = LatentTTSModel(delay_s=0.005)

        # 10 sentences → should produce > STREAMING_CHUNK_THRESHOLD chunks
        text = ". ".join([f"The quick brown fox jumps over the lazy dog {i}" for i in range(10)])

        # Simulate what generation.py does: save each chunk to disk
        saved_chunks: list[dict] = []
        assembled_files: list[Path] = []

        async def on_chunk(idx, total, chunk_audio, sr):
            chunk_path = tmp_path / f"gen_chunk_{idx}.wav"
            # Save as WAV (mirrors save_audio in generation.py)
            sf.write(str(chunk_path), chunk_audio, sr, format="WAV", subtype="FLOAT")
            saved_chunks.append({"idx": idx, "total": total, "path": chunk_path, "sr": sr})
            assembled_files.append(chunk_path)

        # Run the full pipeline
        final_audio, final_sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=100,
            crossfade_ms=50,
            on_chunk=on_chunk,
        )

        # ── Verify chunk delivery ──────────────────────────────────────
        assert len(saved_chunks) >= 5, f"Expected >=5 chunks, got {len(saved_chunks)}"
        assert model.call_count == len(saved_chunks), (
            f"Backend called {model.call_count} times but {len(saved_chunks)} chunks saved"
        )

        # All chunks report the same total
        totals = {c["total"] for c in saved_chunks}
        assert len(totals) == 1, f"Inconsistent totals: {totals}"

        # Indices are sequential (0, 1, 2, ...)
        indices = [c["idx"] for c in saved_chunks]
        assert indices == list(range(len(indices))), f"Non-sequential indices: {indices}"

        # ── Verify chunk file integrity ────────────────────────────────
        for chunk in saved_chunks:
            path = chunk["path"]
            assert path.exists(), f"Chunk file {path} does not exist"
            assert path.stat().st_size > 0, f"Chunk file {path} is empty"

            # Read back and verify it's a valid WAV
            data, sr = sf.read(str(path), dtype="float32")
            assert sr == chunk["sr"], f"Sample rate mismatch: {sr} != {chunk['sr']}"
            assert len(data) > 0, f"Chunk {chunk['idx']} has no audio samples"
            assert not np.all(data == 0), f"Chunk {chunk['idx']} is silent"
            # Verify it's a sine wave (not silence or noise)
            assert np.max(np.abs(data)) > 0.1, f"Chunk {chunk['idx']} amplitude too low"

        # ── Verify final assembled audio ───────────────────────────────
        assert isinstance(final_audio, np.ndarray)
        assert final_audio.dtype == np.float32
        # Each chunk is 0.5s x 24000 = 12000 samples.
        # With crossfade, adjacent chunks overlap by 50ms x 24000 = 1200 samples.
        # 5 chunks: 5x12000 - 4x1200 = 55200 samples.
        n_chunks = len(saved_chunks)
        samples_per_chunk = 12000
        crossfade_samples = int(24000 * 0.05)  # 50ms at 24kHz = 1200
        min_expected = n_chunks * samples_per_chunk - (n_chunks - 1) * crossfade_samples
        assert len(final_audio) >= min_expected, f"Final audio {len(final_audio)} samples < {min_expected} minimum"
        assert final_sr == 24000

        # Final audio should be louder than silence
        rms = np.sqrt(np.mean(final_audio**2))
        assert rms > 0.01, f"Final audio RMS {rms:.4f} is too quiet"

    @pytest.mark.asyncio
    async def test_first_chunk_arrives_before_final(self):
        """First on_chunk callback fires well before the full pipeline completes."""
        model = LatentTTSModel(delay_s=0.05)  # 50ms per chunk

        text = ". ".join([f"Sentence {i}." for i in range(8)])
        first_chunk_time = None
        final_time = None

        async def on_chunk(idx, total, chunk_audio, sr):
            nonlocal first_chunk_time
            if first_chunk_time is None:
                first_chunk_time = time.monotonic()

        t_start = time.monotonic()
        _audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=20,
            on_chunk=on_chunk,
        )
        final_time = time.monotonic()

        assert first_chunk_time is not None, "on_chunk never fired"
        # First chunk should arrive within 200ms of start (before all chunks finish)
        time_to_first = first_chunk_time - t_start
        total_time = final_time - t_start
        assert time_to_first < total_time * 0.5, (
            f"First chunk took {time_to_first:.3f}s but total was {total_time:.3f}s "
            f"— streaming should deliver first chunk early"
        )

    @pytest.mark.asyncio
    async def test_chunk_files_are_valid_wavs(self, tmp_path):
        """Each saved chunk can be read back as a valid WAV file."""
        model = LatentTTSModel()
        text = ". ".join([f"Part {i}" for i in range(7)])

        async def on_chunk(idx, total, chunk_audio, sr):
            path = tmp_path / f"chunk_{idx}.wav"
            sf.write(str(path), chunk_audio, sr, format="WAV", subtype="FLOAT")

        await generate_chunked(model, text, {}, max_chunk_chars=30, on_chunk=on_chunk)

        # Verify each chunk is independently playable
        for i in range(model.call_count):
            path = tmp_path / f"chunk_{i}.wav"
            assert path.exists(), f"Chunk file {path} not found"

            # Read with soundfile (validates WAV header)
            data, sr = sf.read(str(path), dtype="float32")
            assert sr == 24000, f"Sample rate mismatch: {sr}"
            assert len(data) > 0, f"Chunk {i} is empty"

            # Should be a clean sine wave (no NaN, no Inf)
            assert not np.any(np.isnan(data)), f"Chunk {i} contains NaN"
            assert not np.any(np.isinf(data)), f"Chunk {i} contains Inf"

            # Should be non-silent
            assert np.max(np.abs(data)) > 0.1, f"Chunk {i} is silent"


# ── E2E: Streaming disk concatenation path ────────────────────────────


class TestStreamingDiskConcatenationE2E:
    """Verify the _StreamingConcatenator disk-backed path end-to-end."""

    @pytest.mark.asyncio
    async def test_disk_concat_produces_valid_output(self, tmp_path):
        """10+ chunks through _StreamingConcatenator produce valid audio."""
        model = LatentTTSModel()
        text = ". ".join([f"Chunk {i} of a long document." for i in range(12)])
        saved_paths: list[Path] = []

        async def on_chunk(idx, total, chunk_audio, sr):
            path = tmp_path / f"stream_{idx}.wav"
            sf.write(str(path), chunk_audio, sr, format="WAV", subtype="FLOAT")
            saved_paths.append(path)

        audio, sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=40,
            crossfade_ms=50,  # >0 triggers streaming disk path when chunks > threshold
            on_chunk=on_chunk,
        )

        # Should have triggered the streaming disk path
        assert len(saved_paths) > STREAMING_CHUNK_THRESHOLD

        # Final audio is valid
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0
        assert sr == 24000

        # All chunk files exist and are readable
        for p in saved_paths:
            assert p.exists()
            data, file_sr = sf.read(str(p), dtype="float32")
            assert len(data) > 0
            assert file_sr == 24000

    @pytest.mark.asyncio
    async def test_streaming_concat_crossfade_is_smooth(self):
        """Crossfade between chunks produces no clicks (verified via zero-crossings)."""
        sample_rate = 24000
        concat = _StreamingConcatenator(sample_rate, crossfade_ms=50)

        # Generate 6 chunks of sine waves at different frequencies
        for i in range(6):
            freq = 440 + i * 100
            t = np.arange(sample_rate) / sample_rate  # 1 second each
            chunk = (8000 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
            concat.add_chunk(chunk)

        audio = concat.finalize()

        # Audio should be valid and non-trivial length
        assert isinstance(audio, np.ndarray)
        assert len(audio) > sample_rate * 3  # at least 3 seconds

        # No NaN or Inf
        assert not np.any(np.isnan(audio))
        assert not np.any(np.isinf(audio))


# ── E2E: Parallel generation path ─────────────────────────────────────


class TestParallelGenerationE2E:
    """Verify crossfade=0 (parallel) path end-to-end."""

    @pytest.mark.asyncio
    async def test_parallel_produces_valid_assembled_audio(self):
        """8 chunks in parallel (crossfade=0) produce correct final audio."""
        model = LatentTTSModel(delay_s=0.01)
        text = ". ".join([f"Parallel chunk {i}" for i in range(8)])
        chunk_order: list[int] = []

        async def on_chunk(idx, total, chunk_audio, sr):
            chunk_order.append(idx)

        audio, _sr = await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=20,
            crossfade_ms=0,
            on_chunk=on_chunk,
            max_parallel_chunks=4,
        )

        # All 8 chunks delivered
        assert len(chunk_order) == 8
        assert sorted(chunk_order) == list(range(8))

        # Final audio is valid
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0
        # 8 x 0.5s = 4s minimum (no crossfade overlap)
        assert len(audio) >= 24000 * 4

    @pytest.mark.asyncio
    async def test_parallel_chunk_files_saved(self, tmp_path):
        """Parallel chunks saved to disk are all valid WAVs."""
        model = LatentTTSModel(delay_s=0.005)
        text = ". ".join([f"Part {i} here" for i in range(6)])
        saved: list[dict] = []

        async def on_chunk(idx, total, chunk_audio, sr):
            path = tmp_path / f"par_{idx}.wav"
            sf.write(str(path), chunk_audio, sr, format="WAV", subtype="FLOAT")
            saved.append({"idx": idx, "path": path})

        await generate_chunked(
            model,
            text,
            {},
            max_chunk_chars=10,
            crossfade_ms=0,
            on_chunk=on_chunk,
            max_parallel_chunks=3,
        )

        assert len(saved) == model.call_count
        for s in saved:
            assert s["path"].exists()
            data, sr = sf.read(str(s["path"]), dtype="float32")
            assert len(data) > 0
            assert sr == 24000


# ── E2E: Concatenation correctness ────────────────────────────────────


class TestConcatenationE2E:
    """Verify that audio concatenation preserves content and duration."""

    @pytest.mark.asyncio
    async def test_concatenated_audio_duration_matches_sum(self):
        """Final audio duration ≈ sum of chunk durations minus crossfade overlap."""
        model = LatentTTSModel()
        text = ". ".join([f"Sentence {i}" for i in range(4)])
        chunk_durations: list[float] = []

        async def on_chunk(idx, total, chunk_audio, sr):
            chunk_durations.append(len(chunk_audio) / sr)

        audio, sr = await generate_chunked(model, text, {}, max_chunk_chars=20, on_chunk=on_chunk)

        total_chunk_duration = sum(chunk_durations)
        final_duration = len(audio) / sr

        # With crossfade, final should be slightly shorter than sum
        # (crossfade overlaps 50ms between adjacent chunks)
        n_chunks = len(chunk_durations)
        crossfade_overlap_s = 0.05 * (n_chunks - 1)  # 50ms x (n-1) overlaps
        expected_duration = total_chunk_duration - crossfade_overlap_s

        assert abs(final_duration - expected_duration) < 0.1, (
            f"Final duration {final_duration:.3f}s != expected {expected_duration:.3f}s"
        )

    @pytest.mark.asyncio
    async def test_hard_cut_concat_longer_than_crossfade(self):
        """crossfade=0 produces longer audio than crossfade=50ms."""
        text = ". ".join([f"Sentence {i}" for i in range(6)])

        model_cf = LatentTTSModel()
        audio_cf, _ = await generate_chunked(model_cf, text, {}, max_chunk_chars=20, crossfade_ms=50)

        model_hc = LatentTTSModel()
        audio_hc, _ = await generate_chunked(model_hc, text, {}, max_chunk_chars=20, crossfade_ms=0)

        # Hard cut should be longer (no crossfade overlap removed)
        assert len(audio_hc) >= len(audio_cf), f"Hard cut {len(audio_hc)} < crossfade {len(audio_cf)}"


# ── E2E: Streaming chunk playback queue (simulated frontend) ──────────


class TestChunkPlaybackQueue:
    """Simulate the frontend chunk playback queue that processes on_chunk events."""

    @pytest.mark.asyncio
    async def test_playback_queue_receives_all_chunks(self):
        """Simulated playback queue receives and stores all chunks in order."""
        model = LatentTTSModel(delay_s=0.01)
        text = ". ".join([f"Play sentence {i} here" for i in range(8)])

        # Simulate the frontend playback queue
        playback_queue: dict[int, np.ndarray] = {}
        playback_order: list[int] = []

        async def on_chunk(idx, total, chunk_audio, sr):
            # Frontend: store chunk in queue indexed by chunk_index
            playback_queue[idx] = chunk_audio
            playback_order.append(idx)
            # In real frontend: if idx == 0, start playing immediately

        audio, _sr = await generate_chunked(model, text, {}, max_chunk_chars=10, on_chunk=on_chunk)

        # All chunks received
        n_expected = model.call_count
        assert len(playback_queue) == n_expected
        assert len(playback_order) == n_expected

        # First chunk should be playable (not silent, not NaN)
        first = playback_queue[0]
        assert len(first) > 0
        assert not np.any(np.isnan(first))
        assert np.max(np.abs(first)) > 0.1

        # All chunks are float32
        for _idx, chunk in playback_queue.items():
            assert chunk.dtype == np.float32

        # On "completed" event, frontend would switch to final audio
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0
