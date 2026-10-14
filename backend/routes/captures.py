"""Capture (voice input) endpoints."""

import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import config, models
from ..backends import get_llm_model_configs, get_stt_model_configs
from ..database import Capture as DBCapture, get_db
from ..errors import (
    ERR_AUDIO_NOT_FOUND,
    ERR_CAPTURE_CREATE_FAILED,
    ERR_CAPTURE_NOT_FOUND,
    ERR_FILE_EMPTY,
    ERR_FILE_TOO_LARGE_MB,
    ERR_LIMIT_RANGE,
    ERR_OFFSET_NEGATIVE,
    ERR_REFINEMENT_FAILED,
    ERR_RETRANSCRIPTION_FAILED,
)
from ..services import captures as captures_service, settings as settings_service
from ..services.chapters import build_chapters
from ..services.model_files import is_snapshot_installed
from ..services.refinement import RefinementFlags
from ..services.scribe_json import words_json_path

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


@router.post("/captures", response_model=models.CaptureCreateResponse)
async def create_capture_endpoint(
    file: UploadFile = File(...),
    source: str = Form("file"),
    language: str | None = Form(None),
    stt_model: str | None = Form(None),
    db: Session = Depends(get_db),
):
    """Upload audio, run STT, persist the capture."""
    audio_chunks: list[bytes] = []
    total_size = 0
    while chunk := await file.read(UPLOAD_CHUNK_SIZE):
        total_size += len(chunk)
        if total_size > config.IMPORT_AUDIO_MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=ERR_FILE_TOO_LARGE_MB,
            )
        audio_chunks.append(chunk)
    audio_bytes = b"".join(audio_chunks)

    if not audio_bytes:
        raise HTTPException(status_code=400, detail=ERR_FILE_EMPTY)

    saved = settings_service.get_capture_settings(db)
    resolved_stt = stt_model or saved.stt_model
    if language is None:
        resolved_language = None if saved.language == "auto" else saved.language
    else:
        resolved_language = None if language == "auto" else language

    try:
        capture = await captures_service.create_capture(
            audio_bytes=audio_bytes,
            filename=file.filename or "capture.wav",
            source=source,
            language=resolved_language,
            stt_model=resolved_stt,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to create capture")
        raise HTTPException(status_code=500, detail=ERR_CAPTURE_CREATE_FAILED) from e

    return models.CaptureCreateResponse(
        **capture.model_dump(),
        auto_refine=bool(saved.auto_refine),
        allow_auto_paste=bool(saved.allow_auto_paste),
    )


@router.get("/captures", response_model=models.CaptureListResponse)
async def list_captures_endpoint(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail=ERR_LIMIT_RANGE)
    if offset < 0:
        raise HTTPException(status_code=400, detail=ERR_OFFSET_NEGATIVE)

    items, total = captures_service.list_captures(db, limit=limit, offset=offset)
    return models.CaptureListResponse(items=items, total=total)


@router.get("/captures/{capture_id}", response_model=models.CaptureResponse)
async def get_capture_endpoint(capture_id: str, db: Session = Depends(get_db)):
    capture = captures_service.get_capture(capture_id, db)
    if not capture:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)
    return capture


@router.get("/captures/{capture_id}/audio")
async def get_capture_audio_endpoint(capture_id: str, db: Session = Depends(get_db)):
    """Stream the original capture audio file."""
    row = db.query(DBCapture).filter(DBCapture.id == capture_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)

    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    return FileResponse(
        audio_path,
        media_type="audio/wav",
        filename=f"capture_{capture_id}.wav",
    )


@router.get("/captures/{capture_id}/words")
async def get_capture_words_endpoint(capture_id: str, db: Session = Depends(get_db)):
    """Serve the Scribe-shaped words JSON sidecar (video-use contract)."""
    row = db.query(DBCapture).filter(DBCapture.id == capture_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)

    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None:
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    sidecar = words_json_path(audio_path)
    if not sidecar.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    return FileResponse(
        sidecar,
        media_type="application/json",
        filename=f"capture_{capture_id}.words.json",
    )


@router.get("/captures/{capture_id}/chapters")
async def get_capture_chapters_endpoint(capture_id: str, db: Session = Depends(get_db)):
    """Auto-chapters derived from the words sidecar (404 when absent)."""
    row = db.query(DBCapture).filter(DBCapture.id == capture_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)

    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None:
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    sidecar = words_json_path(audio_path)
    if not sidecar.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    try:
        doc = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    words = doc.get("words", [])
    duration = max((w.get("end", 0.0) for w in words), default=0.0)
    return {"chapters": build_chapters(words, float(duration))}


@router.delete("/captures/{capture_id}")
async def delete_capture_endpoint(capture_id: str, db: Session = Depends(get_db)):
    deleted = captures_service.delete_capture(capture_id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)
    return {"message": f"Capture {capture_id} deleted"}


@router.post("/captures/{capture_id}/refine", response_model=models.CaptureResponse)
async def refine_capture_endpoint(
    capture_id: str,
    request: models.CaptureRefineRequest,
    db: Session = Depends(get_db),
):
    saved = settings_service.get_capture_settings(db)
    if request.flags is not None:
        flags = RefinementFlags(
            smart_cleanup=request.flags.smart_cleanup,
            self_correction=request.flags.self_correction,
            preserve_technical=request.flags.preserve_technical,
        )
    else:
        flags = RefinementFlags(
            smart_cleanup=saved.smart_cleanup,
            self_correction=saved.self_correction,
            preserve_technical=saved.preserve_technical,
        )

    resolved_model = request.model_size or saved.llm_model

    try:
        capture = await captures_service.refine_capture(
            capture_id=capture_id,
            flags=flags,
            model_size=resolved_model,
            db=db,
        )
    except Exception as e:
        logger.exception("Refinement failed for capture %s", capture_id)
        raise HTTPException(status_code=500, detail=ERR_REFINEMENT_FAILED) from e

    if not capture:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)
    return capture


@router.get("/capture/readiness", response_model=models.CaptureReadinessResponse)
async def capture_readiness_endpoint(db: Session = Depends(get_db)):
    """Whether the STT and LLM models the user has selected are downloaded.

    The frontend gates the global hotkey on this — pressing the chord with
    a missing model would otherwise produce a stuck "transcribing" pill that
    waits forever for a download to finish. Checks on-disk cache, not RAM
    load, so the answer survives backend restarts.
    """
    saved = settings_service.get_capture_settings(db)

    stt_cfg = next(
        (c for c in get_stt_model_configs() if c.model_size == saved.stt_model),
        None,
    )
    llm_cfg = next(
        (c for c in get_llm_model_configs() if c.model_size == saved.llm_model),
        None,
    )

    if stt_cfg is None or llm_cfg is None:
        # Saved model sizes may reference a config that no longer exists
        # (e.g. after a version upgrade). Return not-ready instead of 500
        # so the frontend can display download prompts instead of erroring.
        return models.CaptureReadinessResponse(
            stt=models.ModelReadiness(
                ready=False,
                model_name=saved.stt_model,
                display_name=saved.stt_model,
                size=saved.stt_model,
                size_mb=None,
            )
            if stt_cfg is None
            else models.ModelReadiness(
                ready=is_snapshot_installed(stt_cfg.hf_repo_id),
                model_name=stt_cfg.model_name,
                display_name=stt_cfg.display_name,
                size=stt_cfg.model_size,
                size_mb=stt_cfg.size_mb or None,
            ),
            llm=models.ModelReadiness(
                ready=False,
                model_name=saved.llm_model,
                display_name=saved.llm_model,
                size=saved.llm_model,
                size_mb=None,
            )
            if llm_cfg is None
            else models.ModelReadiness(
                ready=is_snapshot_installed(llm_cfg.hf_repo_id),
                model_name=llm_cfg.model_name,
                display_name=llm_cfg.display_name,
                size=llm_cfg.model_size,
                size_mb=llm_cfg.size_mb or None,
            ),
        )

    return models.CaptureReadinessResponse(
        stt=models.ModelReadiness(
            ready=is_snapshot_installed(stt_cfg.hf_repo_id),
            model_name=stt_cfg.model_name,
            display_name=stt_cfg.display_name,
            size=stt_cfg.model_size,
            size_mb=stt_cfg.size_mb or None,
        ),
        llm=models.ModelReadiness(
            ready=is_snapshot_installed(llm_cfg.hf_repo_id),
            model_name=llm_cfg.model_name,
            display_name=llm_cfg.display_name,
            size=llm_cfg.model_size,
            size_mb=llm_cfg.size_mb or None,
        ),
    )


@router.post("/captures/{capture_id}/retranscribe", response_model=models.CaptureResponse)
async def retranscribe_capture_endpoint(
    capture_id: str,
    request: models.CaptureRetranscribeRequest,
    db: Session = Depends(get_db),
):
    saved = settings_service.get_capture_settings(db)
    resolved_stt = request.model or saved.stt_model
    if request.language is None:
        resolved_language = None if saved.language == "auto" else saved.language
    else:
        resolved_language = request.language

    try:
        capture = await captures_service.retranscribe_capture(
            capture_id=capture_id,
            stt_model=resolved_stt,
            language=resolved_language,
            db=db,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=410, detail=ERR_AUDIO_NOT_FOUND) from e
    except Exception as e:
        logger.exception("Retranscribe failed for capture %s", capture_id)
        raise HTTPException(status_code=500, detail=ERR_RETRANSCRIPTION_FAILED) from e

    if not capture:
        raise HTTPException(status_code=404, detail=ERR_CAPTURE_NOT_FOUND)
    return capture
