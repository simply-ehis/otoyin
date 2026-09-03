"""ADR (Automated Dialogue Replacement) endpoints — file upload, playback, analysis."""

import asyncio
import logging
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config
from ..config import get_adr_dir, resolve_storage_path
from ..database import ADRSession as DBADRSession, get_db
from ..errors import (
    ERR_ADR_LINE_NOT_FOUND,
    ERR_ADR_SESSION_NOT_FOUND,
    ERR_ADR_TAKE_NOT_FOUND,
    ERR_AUDIO_NOT_FOUND,
    ERR_GUIDE_AUDIO_NOT_FOUND,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB
_ALLOWED_AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac", ".webm", ".opus"}


def _audio_ext_or_wav(filename: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    return ext if ext in _ALLOWED_AUDIO_EXTS else ".wav"


def _fs_safe(value: str, max_len: int = 40) -> str:
    """Make a client-supplied id safe to embed in a filename."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", value)[:max_len]


async def _save_upload_capped(dest: Path, file: UploadFile) -> None:
    """Stream the upload to ``dest``, enforcing the audio size limit."""
    total_size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(_UPLOAD_CHUNK_SIZE):
                total_size += len(chunk)
                if total_size > config.IMPORT_AUDIO_MAX_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (max {config.IMPORT_AUDIO_MAX_BYTES // (1024 * 1024)} MB)",
                    )
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise


class LineInput(BaseModel):
    line_id: str
    original_text: str
    character: str
    target_duration_ms: float = 0.0
    timecode_in: str = ""
    timecode_out: str = ""


class SessionCreate(BaseModel):
    name: str
    fps: float = 24.0
    lines: list[LineInput] = Field(default_factory=list)


class AlignRequest(BaseModel):
    guide_audio: list[float]
    take_audio: list[float]
    sample_rate: int = 24000


class ScoreRequest(BaseModel):
    line_id: str
    audio: list[float]
    sample_rate: int = 24000


class AutoSelectRequest(BaseModel):
    line_id: str


class AudioPathRequest(BaseModel):
    audio_path: str


def _serialize_session(session: DBADRSession) -> dict:
    return {
        "id": session.id,
        "name": session.name,
        "fps": session.fps,
        "guide_audio_path": session.guide_audio_path,
        "guide_duration_ms": session.guide_duration_ms,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


def _serialize_line(line) -> dict:
    return {
        "id": line.id,
        "session_id": line.session_id,
        "line_index": line.line_index,
        "original_text": line.original_text,
        "character": line.character,
        "target_duration_ms": line.target_duration_ms,
        "timecode_in": line.timecode_in,
        "timecode_out": line.timecode_out,
        "selected_take_id": line.selected_take_id,
    }


def _serialize_take(take) -> dict:
    return {
        "id": take.id,
        "line_id": take.line_id,
        "take_number": take.take_number,
        "audio_path": take.audio_path,
        "duration_ms": take.duration_ms,
        "quality_score": take.quality_score,
        "alignment_offset_ms": take.alignment_offset_ms,
        "notes": take.notes,
        "created_at": take.created_at.isoformat() if take.created_at else None,
    }


@router.post("/adr/sessions")
async def create_session(data: SessionCreate, db: Session = Depends(get_db)):
    from ..services.adr import create_session as svc_create

    session = svc_create(
        db,
        name=data.name,
        fps=data.fps,
        lines=[ln.model_dump() for ln in data.lines],
    )
    lines_q = db.query(DBADRSession).filter(DBADRSession.id == session.id).first()
    return _serialize_session(lines_q)


@router.get("/adr/sessions")
async def list_sessions(db: Session = Depends(get_db)):
    from ..services.adr import list_sessions as svc_list

    sessions = svc_list(db)
    return [_serialize_session(s) for s in sessions]


@router.get("/adr/sessions/{session_id}")
async def get_session(session_id: str, db: Session = Depends(get_db)):
    from ..services.adr import get_lines as svc_lines, get_session as svc_get, get_takes

    session = svc_get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=ERR_ADR_SESSION_NOT_FOUND)

    lines = svc_lines(db, session_id)
    lines_data = []
    for line in lines:
        takes = get_takes(db, line.id)
        lines_data.append(
            {
                **_serialize_line(line),
                "takes": [_serialize_take(t) for t in takes],
            }
        )

    return {**_serialize_session(session), "lines": lines_data}


@router.delete("/adr/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    from ..services.adr import delete_session as svc_delete

    ok = svc_delete(db, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail=ERR_ADR_SESSION_NOT_FOUND)
    return {"deleted": session_id}


@router.post("/adr/sessions/{session_id}/guide")
async def upload_guide(
    session_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    from ..services.adr import get_session as svc_get, set_guide_audio

    session = svc_get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=ERR_ADR_SESSION_NOT_FOUND)

    ext = _audio_ext_or_wav(file.filename)
    filename = f"guide_{_fs_safe(session_id)}{ext}"
    dest = get_adr_dir() / filename
    await _save_upload_capped(dest, file)

    try:
        import soundfile as sf

        data, sr = await asyncio.to_thread(sf.read, str(dest))
        duration_ms = (len(data) / sr) * 1000.0
    except Exception:
        logger.debug("Could not read audio duration for guide upload", exc_info=True)
        duration_ms = 0.0

    set_guide_audio(db, session_id, str(dest), duration_ms)
    return {
        "filename": filename,
        "duration_ms": duration_ms,
        "sample_rate": sr if "sr" in locals() else None,
    }


@router.post("/adr/sessions/{session_id}/lines/{line_id}/takes")
async def upload_take(
    session_id: str,
    line_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    from ..services.adr import add_take

    ext = _audio_ext_or_wav(file.filename)
    filename = f"take_{_fs_safe(line_id)}_{uuid.uuid4().hex[:8]}{ext}"
    dest = get_adr_dir() / filename
    await _save_upload_capped(dest, file)

    try:
        import soundfile as sf

        data, sr = await asyncio.to_thread(sf.read, str(dest))
        duration_ms = (len(data) / sr) * 1000.0
    except Exception:
        logger.debug("Could not read audio duration for take upload", exc_info=True)
        duration_ms = 0.0

    take = add_take(db, line_id, filename, duration_ms)
    return _serialize_take(take)


@router.post("/adr/sessions/{session_id}/lines/{line_id}/select/{take_id}")
async def select_take(session_id: str, line_id: str, take_id: str, db: Session = Depends(get_db)):
    from ..services.adr import select_take as svc_select

    ok = svc_select(db, line_id, take_id)
    if not ok:
        raise HTTPException(status_code=404, detail=ERR_ADR_LINE_NOT_FOUND)
    return {"selected_take_id": take_id}


@router.delete("/adr/takes/{take_id}")
async def delete_take(take_id: str, db: Session = Depends(get_db)):
    from ..services.adr import delete_take as svc_delete

    ok = svc_delete(db, take_id)
    if not ok:
        raise HTTPException(status_code=404, detail=ERR_ADR_TAKE_NOT_FOUND)
    return {"deleted": take_id}


@router.get("/adr/audio/{take_id}")
async def get_take_audio(take_id: str, db: Session = Depends(get_db)):
    from ..database import ADRTake as DBTake

    take = db.query(DBTake).filter(DBTake.id == take_id).first()
    if not take:
        raise HTTPException(status_code=404, detail=ERR_ADR_TAKE_NOT_FOUND)
    path = resolve_storage_path(take.audio_path)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    return FileResponse(str(path), media_type="audio/wav")


@router.get("/adr/guide-audio/{session_id}")
async def get_guide_audio(session_id: str, db: Session = Depends(get_db)):
    from ..services.adr import get_session as svc_get

    session = svc_get(db, session_id)
    if not session or not session.guide_audio_path:
        raise HTTPException(status_code=404, detail=ERR_GUIDE_AUDIO_NOT_FOUND)
    path = resolve_storage_path(session.guide_audio_path)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail=ERR_GUIDE_AUDIO_NOT_FOUND)
    return FileResponse(str(path), media_type="audio/wav")


@router.get("/adr/waveform/{take_id}")
async def get_waveform(take_id: str, db: Session = Depends(get_db)):
    from ..database import ADRTake as DBTake
    from ..services.adr import compute_waveform

    take = db.query(DBTake).filter(DBTake.id == take_id).first()
    if not take:
        raise HTTPException(status_code=404, detail=ERR_ADR_TAKE_NOT_FOUND)
    path = resolve_storage_path(take.audio_path)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    waveform = compute_waveform(str(path), 50)
    return {"waveform": waveform}


@router.get("/adr/sessions/{session_id}/guide-waveform")
async def get_guide_waveform(session_id: str, db: Session = Depends(get_db)):
    from ..services.adr import compute_waveform, get_session as svc_get

    session = svc_get(db, session_id)
    if not session or not session.guide_audio_path:
        raise HTTPException(status_code=404, detail=ERR_GUIDE_AUDIO_NOT_FOUND)
    path = resolve_storage_path(session.guide_audio_path)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail=ERR_GUIDE_AUDIO_NOT_FOUND)
    waveform = compute_waveform(str(path), 100)
    return {"waveform": waveform}


@router.post("/adr/align")
async def align_take(data: AlignRequest):
    from ..services.adr import calculate_alignment_offset

    offset_ms = calculate_alignment_offset(data.guide_audio, data.take_audio, data.sample_rate)
    return {"alignment_offset_ms": offset_ms}


@router.post("/adr/score")
async def score_take(data: ScoreRequest):
    from ..services.adr import score_take_quality

    score = score_take_quality(data.audio, data.sample_rate)
    return {"quality_score": round(score, 4)}


@router.post("/adr/sessions/{session_id}/guide-path")
async def upload_guide_path(session_id: str, data: AudioPathRequest, db: Session = Depends(get_db)):
    from ..services.adr import get_session as svc_get, set_guide_audio

    session = svc_get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=ERR_ADR_SESSION_NOT_FOUND)

    src = resolve_storage_path(data.audio_path)
    if src is None or not src.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    ext = src.suffix or ".wav"
    filename = f"guide_{session_id}{ext}"
    dest = get_adr_dir() / filename
    dest.write_bytes(src.read_bytes())

    duration_ms = 0.0
    sample_rate = None
    try:
        import soundfile as sf

        audio_data, sr = await asyncio.to_thread(sf.read, str(dest))
        duration_ms = (len(audio_data) / sr) * 1000.0
        sample_rate = int(sr)
    except Exception as e:
        logging.warning("Failed to read audio file with soundfile for guide upload: %s", e)

    set_guide_audio(db, session_id, str(dest), duration_ms)
    return {"filename": filename, "duration_ms": duration_ms, "sample_rate": sample_rate}


@router.post("/adr/sessions/{session_id}/lines/{line_id}/takes-path")
async def upload_take_path(session_id: str, line_id: str, data: AudioPathRequest, db: Session = Depends(get_db)):
    from ..services.adr import add_take

    src = resolve_storage_path(data.audio_path)
    if src is None or not src.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    ext = src.suffix or ".wav"
    filename = f"take_{line_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = get_adr_dir() / filename
    dest.write_bytes(src.read_bytes())

    duration_ms = 0.0
    try:
        import soundfile as sf

        audio_data, sr = await asyncio.to_thread(sf.read, str(dest))
        duration_ms = (len(audio_data) / sr) * 1000.0
    except Exception as e:
        logging.warning("Failed to read audio file with soundfile for take upload: %s", e)

    take = add_take(db, line_id, filename, duration_ms)
    return _serialize_take(take)


@router.post("/adr/auto-select")
async def auto_select(data: AutoSelectRequest, db: Session = Depends(get_db)):
    from ..database import ADRLine as DBLine
    from ..services.adr import auto_select_best_take, get_takes, select_take as svc_select_take

    line = db.query(DBLine).filter(DBLine.id == data.line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail=ERR_ADR_LINE_NOT_FOUND)

    takes = get_takes(db, data.line_id)
    take_dicts = [
        {
            "id": t.id,
            "duration_ms": t.duration_ms,
            "quality_score": t.quality_score,
        }
        for t in takes
    ]
    selected_id = auto_select_best_take(take_dicts, line.target_duration_ms or 0)
    if selected_id:
        svc_select_take(db, data.line_id, selected_id)
    return {"selected_take_id": selected_id}
