"""Stem separation via ONNX demucs (no torch).

Uses services.stem_separation_onnx (MrCitron/demucs-v4-onnx).
Downloads on first use via the standard model download flow.
"""

from __future__ import annotations

import logging
import os
import tempfile
import uuid
from pathlib import Path

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
        audio = __import__("numpy").repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]

    from services.stem_separation_onnx import separate_audio_onnx

    stems = {}
    for name in STEM_NAMES:
        try:
            arr = separate_audio_onnx(audio.T, sr, stem=name)
            out_path = work / f"{name}.wav"
            import soundfile as sfw
            sfw.write(str(out_path), arr, sr)
            stems[name] = out_path.name
        except Exception as e:
            logger.exception("stem separation failed for %s", name)

    if not stems:
        raise HTTPException(status_code=500, detail="separation failed")
    return {"job_id": job_id, "stems": stems, "names": list(stems.keys()), "engine": "onnx"}


@router.get("/{job_id}/{name}")
def download_stem(job_id: str, name: str):
    work = STEMS_DIR / job_id
    if not work.exists():
        raise HTTPException(status_code=404, detail="job not found")
    for wav in work.rglob(name):
        return FileResponse(wav, media_type="audio/wav", filename=name)
    raise HTTPException(status_code=404, detail="stem not found")