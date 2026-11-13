"""
Demucs ONNX backend - torch-free stem separation.

Uses itamiArika/htdemucs-int8-memory (htdemucs-dft-int8-fp16-final.onnx).
Separates vocals/drums/bass/other from a mix.
"""

import logging
from collections import OrderedDict

import numpy as np

logger = logging.getLogger(__name__)

ONNX_REPO = "itamiArika/htdemucs-int8-memory"
ONNX_FILE = "htdemucs-dft-int8-fp16-final.onnx"
STEMS = ["drums", "bass", "other", "vocals"]
INTERNAL_SR = 44100
CHUNK = 343980
OVERLAP = 0.25
_STEP = int(CHUNK * (1 - OVERLAP))
# Cache the whole 4-stem inference so separate_audio_onnx() can return one
# stem at a time without paying for the model 4x per mix.
_CACHE: OrderedDict[bytes, np.ndarray] = OrderedDict()
_CACHE_MAX = 1

_session = None
_model_name = None


def is_onnx_available() -> bool:
    try:
        import onnxruntime

        return True
    except ImportError:
        return False


def _is_model_cached() -> bool:
    from .model_files import is_model_installed

    return is_model_installed(ONNX_REPO, ONNX_FILE)


def _get_session(model_name: str = "htdemucs"):
    global _session, _model_name
    if _session is not None and _model_name == model_name:
        return _session
    if not _is_model_cached():
        raise RuntimeError(
            "Demucs ONNX weights are not downloaded. Download them from the "
            "Models tab - this app never downloads model weights on first use."
        )
    import onnxruntime as ort

    from .model_files import resolve_model_file

    path = resolve_model_file(ONNX_REPO, ONNX_FILE)
    _session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    _model_name = model_name
    logger.info("Demucs ONNX loaded (%s)", model_name)
    return _session


def _infer_all(waveform: np.ndarray, model_name: str) -> np.ndarray:
    """Run the demucs session over the whole mix with overlap-add; stems are
    returned in HECTOR/stem order (drums, bass, other, vocals)."""
    session = _get_session(model_name)
    mx = float(np.abs(waveform).max())
    if mx > 0:
        waveform = waveform / mx

    n_samples = waveform.shape[1]
    step = _STEP
    window = np.sqrt(np.hanning(CHUNK).astype(np.float32))

    stems_acc = np.zeros((4, 2, n_samples + CHUNK), dtype=np.float32)
    weight_acc = np.zeros((n_samples + CHUNK,), dtype=np.float32)

    i = 0
    visited: set[int] = set()
    while i < n_samples:
        if i in visited:
            break
        visited.add(i)
        chunk = np.zeros((2, CHUNK), dtype=np.float32)
        end = min(i + CHUNK, n_samples)
        chunk[:, : end - i] = waveform[:, i:end]
        inp = chunk[np.newaxis, ...]
        out = session.run(None, {"mix": inp})[0][0]  # (4, 2, CHUNK)
        w = window.copy()
        if end - i < CHUNK:
            w[end - i :] = 0
        for s in range(4):
            stems_acc[s, :, i : i + CHUNK] += out[s] * w[np.newaxis, :]
        weight_acc[i : i + CHUNK] += w
        i += step
        if i >= n_samples:
            break
        if i + CHUNK > n_samples:
            i = n_samples - CHUNK
            if i < 0:
                i = 0

    weight = np.where(weight_acc > 1e-8, weight_acc, 1.0)
    for s in range(4):
        stems_acc[s] = stems_acc[s] / weight[np.newaxis, :]

    out = stems_acc[:, :, :n_samples]
    if mx > 0:
        out = out * mx
    return out.astype(np.float32)


def separate_audio_onnx(
    audio: np.ndarray,
    sample_rate: int,
    stem: str = "vocals",
    model_name: str = "htdemucs",
    invert: bool = False,
) -> np.ndarray:
    """Separate one stem from a mix using Demucs ONNX - no torch.

    If invert=True, returns mix minus the separated stem (e.g. instrumental).
    """
    if stem not in STEMS:
        raise ValueError(f"Unknown stem '{stem}'. Available: {STEMS}")

    if sample_rate != INTERNAL_SR:
        ratio = INTERNAL_SR / sample_rate
        n = int(len(audio) * ratio)
        idx = (np.arange(n) / ratio).astype(int).clip(0, len(audio) - 1)
        audio = audio[idx]

    waveform = np.asarray(audio, dtype=np.float32)
    if waveform.ndim == 1:
        waveform = np.stack([waveform, waveform], axis=0)
    elif waveform.shape[0] != 2:
        waveform = waveform.T

    key = waveform.tobytes()
    cached = _CACHE.get(key)
    if cached is not None:
        _CACHE.move_to_end(key)
        stems = cached
    else:
        stems = _infer_all(waveform, model_name)
        _CACHE[key] = stems
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)

    idx = STEMS.index(stem)
    result = stems[idx]
    if invert:
        mix = waveform[:, : result.shape[1]]
        result = mix - result
    result = np.clip(result, -1.0, 1.0).astype(np.float32)

    if result.shape[0] == 1:
        return result[0]
    return result.T
