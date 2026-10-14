"""
DeepFilterNet ONNX backend — torch-free.

Uses soniqo/DeepFilterNet3-ONNX (MIT license).
Neural speech denoiser via ONNX Runtime instead of PyTorch.

Tensor contract:
  Input:  feat_erb [1,1,T,32], feat_spec [1,2,T,96] float32
  Output: erb_mask [1,1,T,32], df_coefs [1,5,T,96,2] float32

DSP: 48 kHz, 960-point FFT, 480-sample hop, Vorbis window, 32 ERB bands.
"""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

ONNX_REPO = "soniqo/DeepFilterNet3-ONNX"
ONNX_FILE = "deepfilter.onnx"
INTERNAL_SR = 48000
FFT_SIZE = 960
HOP_SIZE = 480
N_ERB = 32
DF_ORDER = 5
N_BINS = FFT_SIZE // 2 + 1


def is_onnx_available() -> bool:
    try:
        import onnxruntime

        return True
    except ImportError:
        return False


def _bundled_model_path() -> Path | None:
    """Weights shipped inside the frozen bundle, or None when absent.

    ``build_binary.py`` stages deepfilter.onnx at ``<bundle>/deepfilter/``
    (mirroring the YAMNet layout). Dev runs — and any install whose bundle
    predates the weights — fall back to the HuggingFace cache.
    """
    import sys

    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidate = Path(meipass) / "deepfilter" / ONNX_FILE
            if candidate.is_file():
                return candidate
    return None


def _is_model_cached() -> bool:
    from .model_files import is_model_installed

    if _bundled_model_path() is not None:
        return True
    return is_model_installed(ONNX_REPO, ONNX_FILE)


_session = None


def _is_session_loaded() -> bool:
    """Whether the DeepFilterNet ONNX session is resident in memory."""
    return _session is not None


def unload_deepfilter() -> None:
    """Release the resident DeepFilterNet ONNX session (called by the idle
    lifecycle scheduler and when neural cleanup is turned off)."""
    global _session
    if _session is None:
        return
    _session = None
    logger.info("DeepFilterNet ONNX unloaded")


def _get_session():
    global _session
    if _session is not None:
        return _session
    if not _is_model_cached():
        raise RuntimeError(
            "DeepFilterNet ONNX weights are not downloaded. "
            "Run the model bootstrap or download via the Models tab — "
            "this app never downloads model weights on first use."
        )
    import onnxruntime as ort

    model_path = _bundled_model_path()
    if model_path is None:
        from .model_files import resolve_model_file

        model_path = resolve_model_file(ONNX_REPO, ONNX_FILE)
    _session = ort.InferenceSession(model_path)
    logger.info("DeepFilterNet ONNX loaded")
    return _session


def _vorbis_window(n: int) -> np.ndarray:
    return np.array([np.sin(0.5 * np.pi * np.sin(np.pi * (i + 0.5) / n) ** 2) for i in range(n)], dtype=np.float32)


def _erb_bandrequencies() -> np.ndarray:
    """Approximate ERB band center frequencies for 32 bands."""
    return np.linspace(0, INTERNAL_SR / 2, N_ERB + 1)


def _compute_erb_features(spec: np.ndarray) -> np.ndarray:
    """Compute ERB spectral features from complex STFT. Returns [1,1,T,32]."""
    mag = np.abs(spec)
    erb_edges = np.linspace(0, mag.shape[1], N_ERB + 1, dtype=int)
    erb = np.zeros((mag.shape[0], N_ERB), dtype=np.float32)
    for i in range(N_ERB):
        start, end = erb_edges[i], erb_edges[i + 1]
        if end > start:
            erb[:, i] = np.mean(mag[:, start:end], axis=1)
    return erb[np.newaxis, np.newaxis, :, :]


def clean_audio_onnx(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Denoise audio using DeepFilterNet ONNX — no torch."""
    if audio.size == 0:
        return audio

    from scipy.signal import resample

    session = _get_session()

    if sample_rate != INTERNAL_SR:
        audio_48 = resample(audio, int(len(audio) * INTERNAL_SR / sample_rate))
    else:
        audio_48 = audio.astype(np.float32)

    window = _vorbis_window(FFT_SIZE)
    n_frames = max(1, (len(audio_48) - FFT_SIZE) // HOP_SIZE + 1)

    enhanced = np.zeros(len(audio_48), dtype=np.float32)
    window_sum = np.zeros(len(audio_48), dtype=np.float32)

    for i in range(n_frames):
        start = i * HOP_SIZE
        frame = audio_48[start : start + FFT_SIZE]
        if len(frame) < FFT_SIZE:
            frame = np.pad(frame, (0, FFT_SIZE - len(frame)))

        windowed = frame * window
        spec = np.fft.rfft(windowed)
        spec_mag = np.abs(spec)

        # Model expects exactly 96 frequency bins
        n_model_bins = 96
        spec_trunc = spec[:n_model_bins]
        spec_mag_trunc = spec_mag[:n_model_bins]

        feat_erb = _compute_erb_features(spec_mag_trunc.reshape(1, -1))
        feat_spec_real = spec_trunc.real.reshape(1, 1, -1)
        feat_spec_imag = spec_trunc.imag.reshape(1, 1, -1)
        feat_spec = np.concatenate([feat_spec_real, feat_spec_imag], axis=1)
        feat_spec = feat_spec.reshape(1, 2, 1, -1)

        erb_mask, _df_coefs = session.run(
            None,
            {
                "feat_erb": feat_erb.astype(np.float32),
                "feat_spec": feat_spec.astype(np.float32),
            },
        )

        # ERB mask is [1,1,T,32] — 32 bands. Interpolate to full spectrum.
        mask_32 = erb_mask.reshape(-1)[:N_ERB]
        mask_full = resample(mask_32, len(spec))

        out_spec = spec * mask_full
        out_frame = np.fft.irfft(out_spec) * FFT_SIZE / HOP_SIZE

        enhanced[start : start + FFT_SIZE] += out_frame * window
        window_sum[start : start + FFT_SIZE] += window**2

    nonzero = window_sum > 1e-8
    enhanced[nonzero] /= window_sum[nonzero]

    if sample_rate != INTERNAL_SR:
        enhanced = resample(enhanced, int(len(enhanced) * sample_rate / INTERNAL_SR))

    return enhanced.astype(np.float32)
