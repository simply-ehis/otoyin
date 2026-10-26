"""Stem separation via ONNX demucs (no torch)."""

from __future__ import annotations

import logging
import tempfile
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stems", tags=["stem-separation"])

STEMS_DIR = Path(tempfile.gettempdir()) / "otoyin_stems"
STEMS_DIR.mkdir(parents=True, exist_ok=True)

STEM_NAMES = ["vocals", "drums", "bass", "other"]


def _onnx_available() -> bool:
    try:
        import onnxruntime  # noqa: F401
        return True
    except ImportError:
        return False


def _is_cached() -> bool:
    try:
        from services.stem_separation_onnx import _is_model_cached
        return _is_model_cached()
    except Exception:
        return False


@router.get("/status")
def status() -> dict:
    return {
        "onnx_available": _onnx_available(),
        "model_cached": _is_cached(),
        "stems": STEM_NAMES,
    }


@router.post("/separate")
async def separate(file: UploadFile = File(...)) -> dict:
    if not _onnx_available():
        raise HTTPException(status_code=503, detail="onnxruntime is not installed")
    if not _is_cached():
        raise HTTPException(status_code=503, detail="Demucs ONNX model not downloaded. Download it from Models first.")

    job_id = uuid.uuid4().hex[:12]
    work = STEMS_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    src = work / (file.filename or "input.wav")
    with open(src, "wb") as f:
        f.write(await file.read())

    audio, sr = sf.read(str(src), dtype="float32", always_2d=True)
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]

    from services.stem_separation_onnx import separate_audio_onnx

    stems = {}
    for name in STEM_NAMES:
        try:
            arr = separate_audio_onnx(audio.T, sr, stem=name)
            out_path = work / f"{name}.wav"
            sf.write(str(out_path), arr, sr)
            stems[name] = out_path.name
        except Exception as e:
            logger.exception("stem separation failed for %s", name)

    if not stems:
        raise HTTPException(status_code=500, detail="separation failed")
    return {"job_id": job_id, "stems": stems, "names": list(stems.keys()), "engine": "onnx"}


@router.post("/{job_id}/vocal-split")
def vocal_split(job_id: str) -> dict:
    work = STEMS_DIR / job_id
    if not work.exists():
        raise HTTPException(status_code=404, detail="job not found")
    vocals_path = None
    for wav in work.rglob("vocals.wav"):
        vocals_path = wav
        break
    if vocals_path is None:
        raise HTTPException(status_code=404, detail="vocals stem not found")
    audio, sr = sf.read(str(vocals_path), dtype="float32", always_2d=True)
    n = audio.shape[0]
    fft = np.fft.rfft(audio, axis=0)
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    cutoff = 1000.0
    mask_high = (freqs >= cutoff).astype(float)
    mask_low = (freqs < cutoff).astype(float)
    lead = np.fft.irfft(fft * mask_high[:, None], n=n, axis=0).astype("float32")
    back = np.fft.irfft(fft * mask_low[:, None], n=n, axis=0).astype("float32")
    lead_path = work / "lead_vocals.wav"
    back_path = work / "backing_vocals.wav"
    sf.write(str(lead_path), lead, sr)
    sf.write(str(back_path), back, sr)
    return {"job_id": job_id, "stems": {"lead_vocals": lead_path.name, "backing_vocals": back_path.name}}


@router.post("/{job_id}/mixdown")
def mixdown(job_id: str) -> dict:
    """Combine all stems into a single mix WAV (equal gain)."""
    work = STEMS_DIR / job_id
    if not work.exists():
        raise HTTPException(status_code=404, detail="job not found")
    stem_arrays = []
    sr = None
    for wav in sorted(work.rglob("*.wav")):
        if wav.name in ("mixdown.wav",) or wav.name.startswith(("lead_", "backing_")):
            continue
        a, s = sf.read(str(wav), dtype="float32", always_2d=True)
        if sr is None:
            sr = s
        stem_arrays.append(a)
    if not stem_arrays:
        raise HTTPException(status_code=404, detail="no stems found")
    maxlen = max(a.shape[0] for a in stem_arrays)
    mixed = np.zeros((maxlen, stem_arrays[0].shape[1]), dtype="float32")
    for a in stem_arrays:
        mixed[:a.shape[0]] += a
    mx = np.abs(mixed).max()
    if mx > 1.0:
        mixed = mixed / mx
    out_path = work / "mixdown.wav"
    sf.write(str(out_path), mixed, sr)
    return {"job_id": job_id, "file": out_path.name}


@router.get("/{job_id}/{name}")
def download_stem(job_id: str, name: str):
    work = STEMS_DIR / job_id
    if not work.exists():
        raise HTTPException(status_code=404, detail="job not found")
    for wav in work.rglob(name):
        return FileResponse(wav, media_type="audio/wav", filename=name)
    raise HTTPException(status_code=404, detail="stem not found")