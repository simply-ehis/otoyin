"""ONNX-based demucs stem separator (no torch).

Uses htdemucs int8 ONNX model. Downloads on first use via
config.get_models_dir() (same pattern as other ONNX backends).
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

HF_REPO = "itamiArika/htdemucs-int8-memory"
MODEL_FILE = "htdemucs-dft-int8-fp16-final.onnx"
LOCAL_NAME = "htdemucs-int8.onnx"

STEM_NAMES = ["vocals", "drums", "bass", "other"]
CHUNK_SIZE = 343980
OVERLAP = 0.25


def _get_models_dir() -> Path:
    from .. import config

    return config.get_models_dir() / "demucs"


def _ensure_model() -> str | None:
    model_dir = _get_models_dir()
    model_dir.mkdir(parents=True, exist_ok=True)
    dest = model_dir / LOCAL_NAME
    if dest.exists():
        return str(dest)
    try:
        from huggingface_hub import hf_hub_download

        src = hf_hub_download(repo_id=HF_REPO, filename=MODEL_FILE)
        shutil.copy2(src, dest)
        try:
            from ..services.model_files import clear_hf_repo_cache

            clear_hf_repo_cache(HF_REPO)
        except Exception:
            pass
        return str(dest)
    except Exception as e:
        logger.warning("Failed to download demucs ONNX model: %s", e)
        return None


def _load_model():
    import onnxruntime as ort

    path = _ensure_model()
    if path is None or not os.path.exists(path):
        return None
    try:
        providers = ["CPUExecutionProvider"]
        try:
            avail = ort.get_available_providers()
            if "CUDAExecutionProvider" in avail:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        except Exception:
            pass
        return ort.InferenceSession(path, providers=providers)
    except Exception:
        logger.exception("failed to load onnx demucs")
        return None


def separate(input_path: str, output_dir: str) -> dict[str, str] | None:
    session = _load_model()
    if session is None:
        return None

    audio, sr = sf.read(input_path, dtype="float32", always_2d=True)
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]
    if sr != 44100:
        ratio = 44100 / sr
        n = int(audio.shape[0] * ratio)
        idx = (np.arange(n) / ratio).astype(int).clip(0, audio.shape[0] - 1)
        audio = audio[idx]
        sr = 44100

    audio = audio.T.astype("float32")
    mx = float(np.abs(audio).max())
    if mx > 0:
        audio = audio / mx

    n_samples = audio.shape[1]
    step = int(CHUNK_SIZE * (1 - OVERLAP))
    stems_acc = np.zeros((4, 2, n_samples + CHUNK_SIZE), dtype=np.float32)
    weight_acc = np.zeros((n_samples + CHUNK_SIZE,), dtype=np.float32)
    window = np.sqrt(np.hanning(CHUNK_SIZE).astype(np.float32))

    i = 0
    visited = set()
    while i < n_samples:
        if i in visited:
            break
        visited.add(i)
        chunk = np.zeros((2, CHUNK_SIZE), dtype=np.float32)
        end = min(i + CHUNK_SIZE, n_samples)
        chunk[:, : end - i] = audio[:, i:end]
        inp = chunk[np.newaxis, ...]
        try:
            out = session.run(None, {"mix": inp})[0][0]
        except Exception:
            logger.exception("onnx inference failed")
            return None
        w = window.copy()
        if end - i < CHUNK_SIZE:
            w[end - i :] = 0
        for s in range(4):
            stems_acc[s, :, i : i + CHUNK_SIZE] += out[s] * w[np.newaxis, :]
        weight_acc[i : i + CHUNK_SIZE] += w
        i += step
        if i >= n_samples:
            break
        if i + CHUNK_SIZE > n_samples:
            i = n_samples - CHUNK_SIZE
            if i < 0:
                i = 0

    w = np.where(weight_acc > 1e-8, weight_acc, 1.0)
    for s in range(4):
        stems_acc[s] = stems_acc[s] / w[np.newaxis, :]
    stems_acc = stems_acc[:, :, :n_samples]
    if mx > 0:
        stems_acc = stems_acc * mx

    os.makedirs(output_dir, exist_ok=True)
    result = {}
    for idx, name in enumerate(STEM_NAMES):
        out_path = os.path.join(output_dir, f"{name}.wav")
        sf.write(out_path, stems_acc[idx].T, sr)
        result[name] = out_path
    return result
