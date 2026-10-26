"""ONNX-based demucs stem separator (no torch).

Uses htdemucs.onnx. Audio I/O via soundfile. No torch dependency.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf

logger = logging.getLogger(__name__)

MODEL_PATH = os.getenv(
    "DEMUCS_ONNX_PATH",
    None,
)

def _resolve_model_path() -> str:
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        return MODEL_PATH
    base = Path(__file__).resolve().parents[1] / "models"
    # Prefer quantized (int8) if available, then fp16, then fp32
    for name in ("htdemucs-dft-int8-fp16-final.onnx", "htdemucs_fp16weights.onnx", "htdemucs.onnx"):
        p = base / name
        if p.exists():
            return str(p)
    return str(base / "htdemucs.onnx")

STEM_NAMES = ["vocals", "drums", "bass", "other"]
CHUNK_SIZE = 343980
OVERLAP = 0.25


def _load_model() -> ort.InferenceSession | None:
    path = _resolve_model_path()
    if not os.path.exists(path):
        return None
    try:
        return ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    except Exception:
        logger.exception("failed to load onnx demucs")
        return None


def separate(input_path: str, output_dir: str) -> dict[str, str] | None:
    """Separate audio into stems. Returns dict stem_name -> wav path."""
    session = _load_model()
    if session is None:
        return None

    audio, sr = sf.read(input_path, dtype="float32", always_2d=True)
    # audio: (samples, channels)
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]
    # Resample to 44100 if needed (simple linear)
    if sr != 44100:
        # nearest-neighbor-ish decimation/interpolation
        ratio = 44100 / sr
        n = int(audio.shape[0] * ratio)
        idx = (np.arange(n) / ratio).astype(int).clip(0, audio.shape[0] - 1)
        audio = audio[idx]
        sr = 44100

    audio = audio.T  # (channels, samples)
    # normalize
    mx = np.abs(audio).max()
    if mx > 0:
        audio = audio / mx

    n_samples = audio.shape[1]
    # pad to multiple of chunk? We'll chunk with overlap.
    step = int(CHUNK_SIZE * (1 - OVERLAP))
    # accumulators
    stems_acc = np.zeros((4, 2, n_samples + CHUNK_SIZE), dtype=np.float32)
    weight_acc = np.zeros((n_samples + CHUNK_SIZE,), dtype=np.float32)

    # Hann window for crossfade
    window = np.hanning(CHUNK_SIZE).astype(np.float32)
    window = np.sqrt(window)  # sqrt for overlap-add

    i = 0
    while i < n_samples:
        chunk = np.zeros((2, CHUNK_SIZE), dtype=np.float32)
        end = min(i + CHUNK_SIZE, n_samples)
        chunk[:, : end - i] = audio[:, i:end]
        inp = chunk[np.newaxis, ...].astype(np.float32)  # (1,2,CHUNK)
        try:
            out = session.run(None, {"mix": inp})[0]  # (1,4,2,CHUNK)
        except Exception:
            logger.exception("onnx inference failed")
            return None
        out = out[0]  # (4,2,CHUNK)
        # apply window
        w = window.copy()
        if end - i < CHUNK_SIZE:
            w[end - i :] = 0
            w[: end - i] = window[: end - i]
        for s in range(4):
            stems_acc[s, :, i : i + CHUNK_SIZE] += out[s] * w[np.newaxis, :]
        weight_acc[i : i + CHUNK_SIZE] += w
        i += step
        if i + CHUNK_SIZE > n_samples and i < n_samples:
            i = n_samples - CHUNK_SIZE
            if i < 0:
                i = 0
            # avoid infinite loop
            if i + step >= n_samples:
                break

    # normalize by weight
    w = np.where(weight_acc > 1e-8, weight_acc, 1.0)
    for s in range(4):
        stems_acc[s] = stems_acc[s] / w[np.newaxis, :]

    stems_acc = stems_acc[:, :, :n_samples]
    # denormalize
    stems_acc = stems_acc * mx

    os.makedirs(output_dir, exist_ok=True)
    result = {}
    for idx, name in enumerate(STEM_NAMES):
        out_path = os.path.join(output_dir, f"{name}.wav")
        sf.write(out_path, stems_acc[idx].T, sr)
        result[name] = out_path
    return result