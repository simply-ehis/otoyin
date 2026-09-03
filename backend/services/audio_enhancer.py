"""Audio enhancement for 21labs.

LavaSR (via audiosronnx) provides neural bandwidth extension — upscales
low-quality audio (8-48 kHz) to a clean 48 kHz signal. Pure ONNX, no
torch at runtime. DeepFilterNet is available as a secondary denoiser.
Both are optional; degrade gracefully if absent.

Two interfaces:
  - ``enhance_audio()`` — batch (whole file at once)
  - ``StreamingLavaSR`` — streaming with overlap-add (real-time / voice-changer)
"""

import logging
from enum import StrEnum

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Availability checks (cached at import time)
# ---------------------------------------------------------------------------

_lavasr_available: bool | None = None


def is_lavasr_available() -> bool:
    """Return True if audiosronnx is importable."""
    global _lavasr_available
    if _lavasr_available is None:
        try:
            import audiosronnx  # noqa: F401

            _lavasr_available = True
        except ImportError:
            _lavasr_available = False
    return _lavasr_available


class EnhanceMode(StrEnum):
    """Enhancement mode selector."""

    AUTO = "auto"  # Lavasr for bandwidth extension, then denoise
    LAVASR = "lavasr"  # Bandwidth extension only (upscale to 48 kHz)
    DENOISE = "denoise"  # DeepFilterNet noise reduction only


# ---------------------------------------------------------------------------
# Lavasr backend
# ---------------------------------------------------------------------------

_lavasr_model = None


def _get_lavasr_model():
    """Lazily load the Lavasr ONNX model (cached globally)."""
    global _lavasr_model
    if _lavasr_model is not None:
        return _lavasr_model

    from audiosronnx import load_sr

    logger.info("Loading Lavasr ONNX model (first use — may download weights)")
    _lavasr_model = load_sr("lavasr")
    return _lavasr_model


def enhance_lavasr(audio: np.ndarray, sample_rate: int) -> tuple[np.ndarray, int]:
    """Upscale audio bandwidth to 48 kHz using Lavasr.

    Returns (enhanced_audio, output_sample_rate).
    """
    model = _get_lavasr_model()
    enhanced, out_sr = model.upscale(audio, sample_rate)
    return enhanced, out_sr


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def enhance_audio(
    audio: np.ndarray,
    sample_rate: int,
    mode: EnhanceMode = EnhanceMode.AUTO,
) -> tuple[np.ndarray, int]:
    """Enhance audio quality.

    Parameters
    ----------
    audio : np.ndarray
        Input audio samples (mono or stereo — will be converted to mono).
    sample_rate : int
        Input sample rate in Hz.
    mode : EnhanceMode
        ``auto`` — Lavasr upscale + DeepFilterNet denoise.
        ``lavasr`` — bandwidth extension only.
        ``denoise`` — DeepFilterNet noise reduction only.

    Returns
    -------
    tuple[np.ndarray, int]
        (enhanced_audio, output_sample_rate)
    """
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    if mode in (EnhanceMode.AUTO, EnhanceMode.LAVASR):
        if is_lavasr_available():
            try:
                audio, sample_rate = enhance_lavasr(audio, sample_rate)
                if mode == EnhanceMode.LAVASR:
                    return audio, sample_rate
            except Exception as exc:
                logger.debug("Lavasr failed (%s); continuing without bandwidth extension", exc)
        elif mode == EnhanceMode.LAVASR:
            raise RuntimeError("audiosronnx is not installed — cannot run Lavasr enhancement")

    if mode in (EnhanceMode.AUTO, EnhanceMode.DENOISE):
        try:
            from .noise_reduction import reduce_noise_deepfilternet

            audio = reduce_noise_deepfilternet(audio, sample_rate)
        except Exception as exc:
            logger.debug("DeepFilterNet denoise failed (%s)", exc)
            if mode == EnhanceMode.DENOISE:
                raise

    return audio, sample_rate


# NOTE: kept for potential public API surface
def get_streaming_lavasr(
    window_sec: float = 2.5,
    overlap: float = 0.25,
    input_sr: int = 16_000,
):
    """Return a StreamingLavaSR instance for real-time bandwidth extension.

    This is the preferred entry point for streaming use cases (voice-changer,
    real-time processing).  Returns None if audiosronnx is not installed.
    """
    if not is_lavasr_available():
        return None
    try:
        from .streaming_lavasr import StreamingLavaSR

        return StreamingLavaSR(window_sec=window_sec, overlap=overlap, input_sr=input_sr)
    except Exception as exc:
        logger.debug("StreamingLavaSR init failed: %s", exc)
        return None
