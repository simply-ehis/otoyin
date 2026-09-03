"""Audio cleanup for 21labs.

Speech denoising is handled by DeepFilterNet ONNX (torch-free, offline/on-device).
The legacy torch-based RNNoise/df.enhance path has been replaced.
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)


def reduce_noise_deepfilternet(
    audio: np.ndarray,
    sample_rate: int,
    vad_threshold: float = 0.5,
) -> np.ndarray:
    """Denoise speech audio with DeepFilterNet ONNX.

    Uses ONNX Runtime — no PyTorch required. Model weights are auto-downloaded
    from HuggingFace Hub on first use and cached locally.
    """
    from .deepfilter_onnx import clean_audio_onnx, is_onnx_available

    if not is_onnx_available():
        raise RuntimeError("onnxruntime is required for DeepFilterNet denoising")

    return clean_audio_onnx(audio, sample_rate)


# Backwards-compatible alias used by routes/features.py and assistant tools.
reduce_noise_rnnoise = reduce_noise_deepfilternet
