"""
Demucs ONNX backend — torch-free stem separation.

Uses MrCitron/demucs-v4-onnx (htdemucs.onnx).
Separates vocals/drums/bass/other from a mix.
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)

ONNX_REPO = "MrCitron/demucs-v4-onnx"
ONNX_FILE = "htdemucs.onnx"
STEMS = ["drums", "bass", "other", "vocals"]
INTERNAL_SR = 44100

_session = None
_model_name = None


def is_onnx_available() -> bool:
    try:
        import onnxruntime

        return True
    except ImportError:
        return False


def _is_model_cached() -> bool:
    from ..backends.base import is_model_cached

    return is_model_cached(ONNX_REPO, required_files=[ONNX_FILE])


def _get_session(model_name: str = "htdemucs"):
    global _session, _model_name
    if _session is not None and _model_name == model_name:
        return _session
    if not _is_model_cached():
        raise RuntimeError(
            "Demucs ONNX weights are not downloaded. Download them from the "
            "Models tab — this app never downloads model weights on first use."
        )
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(ONNX_REPO, ONNX_FILE, local_files_only=True)
    _session = ort.InferenceSession(path)
    _model_name = model_name
    logger.info("Demucs ONNX loaded (%s)", model_name)
    return _session


def separate_audio_onnx(
    audio: np.ndarray,
    sample_rate: int,
    stem: str = "vocals",
    model_name: str = "htdemucs",
    invert: bool = False,
) -> np.ndarray:
    """Separate one stem from a mix using Demucs ONNX — no torch.

    If invert=True, returns mix minus the separated stem (e.g. instrumental).
    """
    if stem not in STEMS:
        raise ValueError(f"Unknown stem '{stem}'. Available: {STEMS}")

    session = _get_session(model_name)

    from scipy.signal import resample

    if sample_rate != INTERNAL_SR:
        audio = resample(audio, int(len(audio) * INTERNAL_SR / sample_rate))

    waveform = np.asarray(audio, dtype=np.float32)
    if waveform.ndim == 1:
        waveform = np.stack([waveform, waveform], axis=0)
    elif waveform.shape[0] != 2:
        waveform = waveform.T

    # Pad to multiple of 4410 (Demucs chunk size)
    orig_len = waveform.shape[1]
    pad = (4410 - orig_len % 4410) % 4410
    if pad > 0:
        waveform = np.pad(waveform, ((0, 0), (0, pad)))

    chunk_size = 4410 * 100  # ~100 frames per chunk
    n_chunks = max(1, waveform.shape[1] // chunk_size)
    chunks = np.array_split(waveform, n_chunks, axis=1)

    results = []
    for chunk in chunks:
        inp = chunk[np.newaxis, :, :]  # [1, 2, T]
        out = session.run(None, {"input": inp})[0]
        results.append(out[0])

    full = np.concatenate(results, axis=1)[:, :orig_len]
    idx = STEMS.index(stem)
    result = full[idx]
    if invert:
        # Mix minus stem: subtract the separated stem from the original mix
        mix = waveform[:, :orig_len]
        result = mix - result
    result = np.clip(result, -1.0, 1.0).astype(np.float32)

    if result.shape[0] == 1:
        return result[0]
    return result.T
