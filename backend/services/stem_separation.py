import logging

import numpy as np

logger = logging.getLogger(__name__)

_SEPARATION_AVAILABLE = None


def _is_available() -> bool:
    """Check if demucs + torch are available (lazy, cached)."""
    global _SEPARATION_AVAILABLE
    if _SEPARATION_AVAILABLE is not None:
        return _SEPARATION_AVAILABLE
    try:
        import torch
        from demucs.pretrained import get_model

        _SEPARATION_AVAILABLE = True
    except ImportError:
        _SEPARATION_AVAILABLE = False
    return _SEPARATION_AVAILABLE


SEPARATION_AVAILABLE = _is_available()


_STEM_CACHE = None


def _load_model(model_name: str):
    global _STEM_CACHE
    if _STEM_CACHE is not None and _STEM_CACHE[0] == model_name:
        return _STEM_CACHE[1]
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model(model_name)
    model.eval()
    _STEM_CACHE = (model_name, (model, apply_model))
    return _STEM_CACHE[1]


def separate_audio(
    audio: np.ndarray,
    sample_rate: int,
    stem: str = "vocals",
    model_name: str = "htdemucs",
    invert: bool = False,
) -> np.ndarray:
    """Separate one stem (vocals/drums/bass/other) from a mix.

    Prefers ONNX Runtime (torch-free) when available and model is cached.
    Falls back to the torch-based Demucs path otherwise.
    If invert=True, returns mix minus the separated stem.
    """
    from .stem_separation_onnx import _is_model_cached, is_onnx_available, separate_audio_onnx

    if is_onnx_available() and _is_model_cached():
        try:
            return separate_audio_onnx(audio, sample_rate, stem, model_name, invert=invert)
        except Exception as exc:
            logger.warning(
                "Demucs ONNX failed for stem=%s model=%s; falling back to torch: %s",
                stem,
                model_name,
                exc,
                exc_info=True,
            )

    if not _is_available():
        raise RuntimeError(
            "Stem separation requires 'demucs' and 'torch'. Install them offline "
            "(pip install demucs) and download the model before using this feature."
        )

    model, apply_model = _load_model(model_name)
    expected_sr = getattr(model, "sr", 44100)
    from scipy.signal import resample

    if sample_rate != expected_sr:
        audio = resample(audio, int(len(audio) * expected_sr / sample_rate))
        sample_rate = expected_sr

    waveform = np.asarray(audio, dtype=np.float32)
    if waveform.ndim == 1:
        waveform = np.stack([waveform, waveform], axis=0)
    elif waveform.shape[0] != 2:
        waveform = waveform.T

    import torch

    tensor = torch.from_numpy(waveform).unsqueeze(0)
    sources = apply_model(model, tensor, device="cpu", progress=False)[0]
    source_list = model.sources
    if stem not in source_list:
        raise ValueError(f"Unknown stem '{stem}'. Available: {source_list}")
    idx = source_list.index(stem)
    result = sources[idx].cpu().numpy()
    if invert:
        mix = waveform
        result = mix - result
    result = np.clip(result, -1.0, 1.0).astype(np.float32)
    if result.shape[0] == 1:
        return result[0]
    return result.T
