"""
Voice Activity Detection using Silero VAD v5 (ONNX Runtime).

Provides accurate speech boundary detection for the voice chat pipeline.
Replaces the basic energy-based VAD for reliable turn-taking.

Uses ONNX Runtime instead of PyTorch — faster startup, lower memory,
no torch dependency for this module.
"""

import logging
import threading
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
WINDOW_SIZE = 512  # Silero native frame size at 16kHz (32ms)

# State shape: h=[1, batch, 128], c=[1, batch, 128], concat → [2, batch, 128]
_STATE_H_SHAPE = (1, 1, 128)
_STATE_C_SHAPE = (1, 1, 128)


def _find_onnx_model() -> str | None:
    """Locate silero_vad.onnx — check torch cache, then HF cache."""
    # 1. torch.hub cache (already downloaded by prior torch usage)
    torch_cache = Path.home() / ".cache" / "torch" / "hub"
    # Prefer the 16kHz op15 model — smaller, faster, no Conv shape issues
    for pattern in (
        "snakers4_silero-vad*/src/silero_vad/data/silero_vad_16k_op15.onnx",
        "snakers4_silero-vad*/src/silero_vad/data/silero_vad.onnx",
    ):
        for candidate in torch_cache.glob(pattern):
            if candidate.is_file():
                return str(candidate)

    # 2. HuggingFace cache
    hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
    for candidate in hf_cache.glob("models--snakers4*silero*vad*/**/silero_vad*.onnx"):
        if candidate.is_file():
            return str(candidate)

    # 3. data/ directory (bundled in PyInstaller builds)
    data_dir = Path(__file__).resolve().parent.parent.parent / "data"
    for name in ("silero_vad_16k_op15.onnx", "silero_vad.onnx"):
        bundled = data_dir / name
        if bundled.is_file():
            return str(bundled)

    # 4. installed silero-vad wheel (ships its own onnx weights)
    try:
        import silero_vad

        pkg_data = Path(silero_vad.__file__).resolve().parent / "data"
        for name in ("silero_vad_16k_op15.onnx", "silero_vad.onnx"):
            candidate = pkg_data / name
            if candidate.is_file():
                return str(candidate)
    except ImportError:
        pass

    return None


class SileroVAD:
    """Silero VAD v5 wrapper — ONNX Runtime, no PyTorch.

    Thread-safe: the ONNX session is loaded lazily and protected by a lock.
    """

    def __init__(
        self,
        threshold: float = 0.5,
        min_speech_frames: int = 5,
        min_silence_frames: int = 10,
        speech_pad_ms: int = 150,
    ):
        self.threshold = threshold
        self.min_speech_frames = min_speech_frames
        self.min_silence_frames = min_silence_frames
        self.speech_pad_ms = speech_pad_ms

        self._session = None
        self._model_load_failed = False
        self._lock = threading.Lock()
        self._h = np.zeros(_STATE_H_SHAPE, dtype=np.float32)
        self._c = np.zeros(_STATE_C_SHAPE, dtype=np.float32)
        self._speech_count = 0
        self._silence_count = 0
        self._is_speech = False

    def _ensure_model(self):
        """Lazy-load the Silero VAD ONNX model."""
        if self._session is not None or self._model_load_failed:
            return
        with self._lock:
            if self._session is not None:
                return
            try:
                import onnxruntime as ort

                model_path = _find_onnx_model()
                if model_path is None:
                    raise FileNotFoundError("silero_vad.onnx not found in torch cache or data/")

                from ..backends._onnx_precision import resolve_providers

                self._session = ort.InferenceSession(
                    model_path,
                    providers=resolve_providers(),
                )
                logger.info("Silero VAD ONNX loaded from %s", model_path)
            except Exception as e:
                logger.warning("Failed to load Silero VAD ONNX, falling back to energy-based: %s", e)
                self._session = None
                self._model_load_failed = True

    def reset(self):
        """Reset internal state for a new utterance."""
        self._speech_count = 0
        self._silence_count = 0
        self._is_speech = False
        with self._lock:
            self._h = np.zeros(_STATE_H_SHAPE, dtype=np.float32)
            self._c = np.zeros(_STATE_C_SHAPE, dtype=np.float32)

    def detect(self, audio_chunk: np.ndarray) -> dict:
        """Detect speech in an audio chunk.

        Args:
            audio_chunk: Float32 PCM samples at 16kHz. Can be any length
                         but 512 samples (32ms) is the Silero native frame size.

        Returns:
            dict with keys:
                - speech_prob: float 0-1, probability of speech
                - is_speech: bool, whether speech is currently detected
                - speech_started: bool, rising edge (silence -> speech)
                - speech_ended: bool, falling edge (speech -> silence)
        """
        self._ensure_model()

        if self._session is None:
            return self._detect_energy(audio_chunk)

        return self._detect_silero(audio_chunk)

    def _detect_silero(self, audio_chunk: np.ndarray) -> dict:
        """Silero VAD detection via ONNX Runtime."""
        if len(audio_chunk) == 0:
            return {"speech_prob": 0.0, "is_speech": False, "speech_started": False, "speech_ended": False}

        # Ensure float32 and correct shape [batch=1, samples]
        audio = np.asarray(audio_chunk, dtype=np.float32)
        if audio.ndim == 1:
            audio = audio.reshape(1, -1)

        with self._lock:
            state = np.concatenate([self._h, self._c], axis=0)  # [2, 1, 128]
            sr = np.array(SAMPLE_RATE, dtype=np.int64)

            output, state_n = self._session.run(
                None,
                {"input": audio, "state": state, "sr": sr},
            )

            speech_prob = float(output[0, 0])
            # state_n shape: [batch=1, 2, 128] → split into h and c
            self._h = state_n[0:1, :, :].copy()  # [1, 1, 128]
            self._c = state_n[1:2, :, :].copy()  # [1, 1, 128]

        is_speech = speech_prob > self.threshold

        if is_speech:
            self._speech_count += 1
            self._silence_count = 0
        else:
            self._silence_count += 1
            if self._speech_count >= self.min_speech_frames:
                pass
            else:
                self._speech_count = 0

        was_speech = self._is_speech
        self._is_speech = self._speech_count >= self.min_speech_frames

        speech_started = self._is_speech and not was_speech
        speech_ended = not self._is_speech and was_speech and self._silence_count >= self.min_silence_frames

        if speech_ended:
            self._speech_count = 0
            self._silence_count = 0

        return {
            "speech_prob": speech_prob,
            "is_speech": self._is_speech,
            "speech_started": speech_started,
            "speech_ended": speech_ended,
        }

    def _detect_energy(self, audio_chunk: np.ndarray) -> dict:
        """Fallback energy-based detection when Silero is unavailable."""
        if len(audio_chunk) == 0:
            return {"speech_prob": 0.0, "is_speech": False, "speech_started": False, "speech_ended": False}

        energy = float(np.sqrt(np.mean(audio_chunk.astype(np.float32) ** 2)))
        is_loud = energy > 0.02

        if is_loud:
            self._speech_count += 1
            self._silence_count = 0
        else:
            self._silence_count += 1

        was_speech = self._is_speech

        if self._speech_count >= self.min_speech_frames:
            self._is_speech = self._silence_count < self.min_silence_frames
        else:
            self._is_speech = False

        speech_started = self._is_speech and not was_speech
        speech_ended = not self._is_speech and was_speech and self._silence_count >= self.min_silence_frames

        if speech_ended:
            self._speech_count = 0
            self._silence_count = 0

        return {
            "speech_prob": min(energy * 10, 1.0),
            "is_speech": self._is_speech,
            "speech_started": speech_started,
            "speech_ended": speech_ended,
        }


_vad_instance: SileroVAD | None = None
_vad_lock = threading.Lock()


def get_vad(
    threshold: float = 0.5,
    min_speech_frames: int = 5,
    min_silence_frames: int = 10,
) -> SileroVAD:
    """Get or create the shared VAD instance."""
    global _vad_instance
    if _vad_instance is None:
        with _vad_lock:
            if _vad_instance is None:
                _vad_instance = SileroVAD(
                    threshold=threshold,
                    min_speech_frames=min_speech_frames,
                    min_silence_frames=min_silence_frames,
                )
    return _vad_instance


def reset_vad():
    """Reset the shared VAD instance for a new session."""
    if _vad_instance is not None:
        _vad_instance.reset()
