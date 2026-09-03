"""DeepFilterNet-based audio cleanup for 21labs.

Replaces the old RNNoise path. DeepFilterNet is a neural speech denoiser
that runs fully offline/on-device (CPU or CUDA). Weights are pre-cached at
first import (see maybe_download_model) so no network is needed at runtime.

DeepFilterNet 0.5.6's `df.io` imports a removed `torchaudio.backend`
submodule under modern torchaudio; we shim that import so the package loads
against the project's torch 2.12 / torchaudio 2.11 stack without downgrading.
"""

import importlib.util
import logging
import sys
import types

logger = logging.getLogger(__name__)


def _install_torchaudio_shim() -> None:
    """Shim the removed ``torchaudio.backend.common`` module DeepFilterNet imports."""
    if "torchaudio.backend.common" in sys.modules:
        return
    if importlib.util.find_spec("torchaudio") is None:
        return

    common = types.ModuleType("torchaudio.backend.common")

    class AudioMetaData:  # minimal stand-in used only at import time
        pass

    common.AudioMetaData = AudioMetaData
    backend = types.ModuleType("torchaudio.backend")
    backend.common = common
    sys.modules["torchaudio.backend"] = backend
    sys.modules["torchaudio.backend.common"] = common


_MODEL = None
_DF_STATE = None
_SR = 48000  # DeepFilterNet operates at 48 kHz internally


def _get_model():
    global _MODEL, _DF_STATE
    if _MODEL is not None:
        return _MODEL, _DF_STATE
    _install_torchaudio_shim()
    import df

    model, df_state, _ = df.init_df("DeepFilterNet")
    _MODEL = model
    _DF_STATE = df_state
    logger.info("DeepFilterNet cleanup model loaded")
    return _MODEL, _DF_STATE


def clean_audio_deepfilternet(
    audio: "np.ndarray",  # type: ignore[name-defined]
    sample_rate: int,
) -> "np.ndarray":  # type: ignore[name-defined]
    """Denoise audio with DeepFilterNet.

    Resamples to 48 kHz if needed, runs the model, and returns audio at the
    original sample rate (float32, [-1, 1]).
    """
    import numpy as np
    import torch

    _install_torchaudio_shim()
    import df

    if audio.size == 0:
        return audio

    model, df_state = _get_model()

    # Resample to the model's native rate if necessary.
    if sample_rate != _SR:
        import librosa

        audio_48 = librosa.resample(audio, orig_sr=sample_rate, target_sr=_SR)
    else:
        audio_48 = audio

    tensor = torch.from_numpy(audio_48.astype(np.float32))
    if tensor.dim() == 1:
        tensor = tensor.unsqueeze(0)  # [T] -> [1, T] (channel-first)
    with torch.no_grad():
        cleaned = df.enhance(model, df_state, tensor)
    cleaned_np = cleaned.cpu().numpy().astype(np.float32)
    if cleaned_np.shape[0] == 1:
        cleaned_np = cleaned_np[0]

    if sample_rate != _SR:
        import librosa

        cleaned_np = librosa.resample(cleaned_np, orig_sr=_SR, target_sr=sample_rate)

    return cleaned_np
