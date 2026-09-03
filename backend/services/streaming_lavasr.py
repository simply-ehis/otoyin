"""Streaming LavaSR wrapper — overlap-add bandwidth extension for real-time use.

Processes audio in 2-4 s windows with configurable overlap and linear crossfade,
upscaling from 16 kHz to 48 kHz. Designed for the voice-changer pipeline where
low latency matters more than perfect global coherence.

Usage::

    sr = StreamingLavaSR(window_sec=2.5, overlap=0.25)
    enhanced_48k = sr.process(chunk_16k)  # returns np.ndarray at 48 kHz
    enhanced_48k = sr.process(chunk_16k)  # stateful — crossfade handles boundaries
    final = sr.flush()  # drain residual audio
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TARGET_SR = 48_000
_MIN_WINDOW_SAMPLES = 8_000  # 0.5 s at 16 kHz — hard lower bound
_MAX_WINDOW_SAMPLES = 128_000  # 8 s at 16 kHz — hard upper bound


def _lavasr_available() -> bool:
    try:
        import audiosronnx  # noqa: F401

        return True
    except ImportError:
        return False


def _get_lavasr_model():
    from audiosronnx import load_sr

    return load_sr("lavasr")


# ---------------------------------------------------------------------------
# StreamingLavaSR
# ---------------------------------------------------------------------------


class StreamingLavaSR:
    """Stateful streaming bandwidth extension using LavaSR ONNX.

    Parameters
    ----------
    window_sec : float
        Size of each processing window in seconds (at 16 kHz). Default 2.5.
    overlap : float
        Fraction of window that overlaps with the previous one (0.0-0.5).
        Default 0.25 (25 %).
    input_sr : int
        Input sample rate. Default 16 000.
    """

    def __init__(
        self,
        window_sec: float = 2.5,
        overlap: float = 0.25,
        input_sr: int = 16_000,
    ) -> None:
        self.input_sr = input_sr
        self.output_sr = _TARGET_SR
        self._window_samples = max(
            _MIN_WINDOW_SAMPLES,
            min(int(window_sec * input_sr), _MAX_WINDOW_SAMPLES),
        )
        self._overlap = max(0.0, min(overlap, 0.5))
        self._hop_samples = int(self._window_samples * (1.0 - self._overlap))
        self._crossfade_samples = self._window_samples - self._hop_samples

        # Ratio for upscaling indices
        self.sr_ratio = _TARGET_SR / input_sr

        # Residual buffer from previous window (in input-sr domain)
        self._prev_tail: np.ndarray = np.array([], dtype=np.float32)

        # LavaSR model (lazy)
        self._model = None

    # ------------------------------------------------------------------
    # Model access
    # ------------------------------------------------------------------

    def _ensure_model(self):
        if self._model is None:
            if not _lavasr_available():
                raise RuntimeError("audiosronnx is not installed — cannot run streaming LavaSR")
            self._model = _get_lavasr_model()
            logger.info("StreamingLavaSR: LavaSR model loaded")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process(self, audio: np.ndarray) -> np.ndarray:
        """Process one chunk of audio and return enhanced 48 kHz output.

        The chunk is accumulated internally; output may lag by one window
        for all but the first call.  Call ``flush()`` to drain the final
        segment.
        """
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        audio = audio.astype(np.float32)

        # Prepend residual from previous call
        if len(self._prev_tail) > 0:
            audio = np.concatenate([self._prev_tail, audio])

        # If we don't have a full window yet, buffer it
        if len(audio) < self._window_samples:
            self._prev_tail = audio
            return np.array([], dtype=np.float32)

        # Process full windows
        self._ensure_model()
        output_chunks: list[np.ndarray] = []
        pos = 0

        while pos + self._window_samples <= len(audio):
            window = audio[pos : pos + self._window_samples]
            upscaled = self._upscale_window(window)
            output_chunks.append(upscaled)
            pos += self._hop_samples

        # Save leftover for next call
        self._prev_tail = audio[pos:] if pos < len(audio) else np.array([], dtype=np.float32)

        if not output_chunks:
            return np.array([], dtype=np.float32)

        return self._overlap_add(output_chunks)

    def flush(self) -> np.ndarray:
        """Drain any remaining buffered audio through the model.

        Call this once at the end of a stream to process the final
        partial window.
        """
        if len(self._prev_tail) == 0:
            return np.array([], dtype=np.float32)

        self._ensure_model()

        # Save and clear the tail
        tail = self._prev_tail
        self._prev_tail = np.array([], dtype=np.float32)

        if len(tail) < self._window_samples:
            # Don't pad — just upscale what we have and return
            try:
                enhanced, out_sr = self._model.upscale(tail, self.input_sr)
                if out_sr != self._TARGET_SR:
                    import scipy.signal

                    num_samples = int(len(enhanced) * self._TARGET_SR / out_sr)
                    enhanced = scipy.signal.resample(enhanced, num_samples).astype(np.float32)
                return enhanced
            except Exception as exc:
                logger.debug("LavaSR upscale failed on flush: %s", exc)
                return np.repeat(tail, int(self.sr_ratio)).astype(np.float32)

        # Full window — process normally
        upscaled = self._upscale_window(tail)
        return upscaled

    def reset(self) -> None:
        """Clear all internal state."""
        self._prev_tail = np.array([], dtype=np.float32)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _upscale_window(self, window_16k: np.ndarray) -> np.ndarray:
        """Run LavaSR on a single window and return 48 kHz output."""
        try:
            enhanced, out_sr = self._model.upscale(window_16k, self.input_sr)
            if out_sr != self._TARGET_SR:
                # Resample if model returned a different rate
                import scipy.signal

                num_samples = int(len(enhanced) * self._TARGET_SR / out_sr)
                enhanced = scipy.signal.resample(enhanced, num_samples).astype(np.float32)
            return enhanced
        except Exception as exc:
            logger.debug("LavaSR upscale failed: %s — returning zero-padded", exc)
            # Graceful degradation: just upsample by repetition
            return np.repeat(window_16k, int(self.sr_ratio)).astype(np.float32)

    def _overlap_add(self, chunks: list[np.ndarray]) -> np.ndarray:
        """Overlap-add with linear crossfade between consecutive windows.

        The output length is computed as:
            (num_chunks - 1) * out_hop + len(last_chunk)
        which accounts for the fact that windows overlap.
        """
        if len(chunks) == 1:
            return chunks[0]

        # Each chunk is at 48 kHz. Compute the hop in output samples.
        out_hop = int(self._hop_samples * self.sr_ratio)
        out_cf = int(self._crossfade_samples * self.sr_ratio)

        # Total output length: last window starts at (n-1)*hop
        total_len = out_hop * (len(chunks) - 1) + len(chunks[-1])
        output = np.zeros(total_len, dtype=np.float32)

        for i, chunk in enumerate(chunks):
            start = i * out_hop
            end = start + len(chunk)

            if end > total_len:
                chunk = chunk[: total_len - start]
                end = total_len

            if i > 0 and out_cf > 0 and len(chunk) >= out_cf:
                # Crossfade with tail of previous chunk
                fade_in = np.linspace(0.0, 1.0, min(out_cf, len(chunk)), dtype=np.float32)
                fade_out = 1.0 - fade_in
                overlap_start = start
                overlap_end = overlap_start + len(fade_in)
                if overlap_end <= total_len:
                    output[overlap_start:overlap_end] *= fade_out
                    chunk[: len(fade_in)] *= fade_in

            output[start:end] += chunk[: end - start]

        return output
