"""Stem separation via demucs (optional)."""

from __future__ import annotations

import logging
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stems", tags=["stem-separation"])

STEMS_DIR = Path(tempfile.gettempdir()) / "otoyin_stems"
STEMS_DIR.mkdir(parents=True, exist_ok=True)

STEM_NAMES = ["vocals", "drums", "bass", "other"]


def _demucs_available() -> bool:
    try:
        import demucs  # noqa: F401
        return True
    except ImportError:
        return False


@router.get("/status")
def status() -> dict:
    return {"demucs_available": _demucs_available(), "stems": STEM_NAMES}


@router.post("/separate")
async def separate(file: UploadFile = File(...)) -> dict:
    if not _demucs_available():
        raise HTTPException(status_code=503, detail="demucs is not installed")
    job_id = uuid.uuid4().hex[:12]
    work = STEMS_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    src = work / (file.filename or "input.wav")
    with open(src, "wb") as f:
        f.write(await file.read())
    out_dir = work / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [sys.executable, "-m", "demucs", "-o", str(out_dir), str(src)],
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.CalledProcessError as e:
        logger.exception("demucs failed")
        raise HTTPException(status_code=500, detail=e.stderr or "separation failed")
    result_dir = None
    for p in out_dir.rglob("*.wav"):
        result_dir = p.parent
        break
    stems = {}
    if result_dir:
        for wav in result_dir.glob("*.wav"):
            stems[wav.stem] = wav.name
    return {"job_id": job_id, "stems": stems, "names": list(stems.keys())}


@router.get("/{job_id}/{name}")
def download_stem(job_id: str, name: str):
    work = STEMS_DIR / job_id
    if not work.exists():
        raise HTTPException(status_code=404, detail="job not found")
    for wav in work.rglob(name):
        return FileResponse(wav, media_type="audio/wav", filename=name)
    raise HTTPException(status_code=404, detail="stem not found")