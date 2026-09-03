"""Transcription endpoints."""

import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import config, models
from ..backends.whisper_cpp_backend import WHISPER_CPP_FILES
from ..errors import ERR_AUDIO_NOT_FOUND, ERR_INVALID_MODEL_SIZE, ERR_TRANSCRIPTION_FAILED
from ..services import transcribe
from ..utils.model_lifecycle import lifecycle_manager

router = APIRouter()

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB


def _assert_whisper_entitled(model_size: str) -> None:
    """Manifest gate for STT: only downloaded models may load. Never auto-downloads.

    Raises HTTPException(400) with a friendly message when the model was not
    downloaded via the Models tab. The caller is still responsible for the
    file-presence cache check (to distinguish "download it" from "re-download,
    you deleted the file").
    """
    from ..backends.configs import get_stt_model_configs
    from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG, is_downloaded

    cfg = next((c for c in get_stt_model_configs() if c.model_size == model_size), None)
    if cfg is None or not is_downloaded(cfg.model_name, cfg.model_size):
        raise HTTPException(status_code=400, detail=MODEL_NOT_DOWNLOADED_MSG)


@router.post("/transcribe", response_model=models.TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    model: str | None = Form(None),
):
    """Transcribe audio file to text."""
    total_size = 0
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        while chunk := await file.read(UPLOAD_CHUNK_SIZE):
            total_size += len(chunk)
            if total_size > config.IMPORT_AUDIO_MAX_BYTES:
                tmp.close()
                Path(tmp.name).unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large (max {config.IMPORT_AUDIO_MAX_BYTES // (1024 * 1024)} MB)",
                )
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        from ..backends.configs import get_stt_model_configs
        from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG
        from ..utils.audio import load_audio

        model_size = model

        cloud_cfg = (
            next((c for c in get_stt_model_configs() if c.model_size == model_size), None) if model_size else None
        )
        if cloud_cfg is not None and cloud_cfg.engine == "cloud":
            # Validate audio exists & get duration without double-decoding
            audio, sr = await asyncio.to_thread(load_audio, tmp_path)
            duration = len(audio) / sr
            try:
                text = await transcribe.transcribe_via_cloud_stt(tmp_path, language)
            except LookupError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            return models.TranscriptionResponse(text=text, duration=duration)

        # Local Whisper path — validate model before decoding audio
        valid_sizes = list(WHISPER_CPP_FILES.keys())
        whisper_model = transcribe.get_whisper_model()
        resolved_size = model_size or whisper_model.model_size
        if resolved_size not in valid_sizes:
            raise HTTPException(
                status_code=400,
                detail=ERR_INVALID_MODEL_SIZE.format(sizes=", ".join(valid_sizes)),
            )
        _assert_whisper_entitled(resolved_size)
        already_loaded = whisper_model.is_loaded() and whisper_model.model_size == resolved_size
        if not already_loaded and not whisper_model._is_model_cached(resolved_size):
            raise HTTPException(status_code=400, detail=MODEL_NOT_DOWNLOADED_MSG)

        audio, sr = await asyncio.to_thread(load_audio, tmp_path)
        duration = len(audio) / sr

        lifecycle_manager.mark_model_used("whisper")
        model_size = resolved_size
        text = await whisper_model.transcribe(tmp_path, language, model_size)

        return models.TranscriptionResponse(
            text=text,
            duration=duration,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_TRANSCRIPTION_FAILED) from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)


class TranscriptionPathRequest(BaseModel):
    audio_path: str
    language: str | None = None
    model: str | None = None


@router.post("/transcribe/path", response_model=models.TranscriptionResponse)
async def transcribe_audio_path(data: TranscriptionPathRequest):
    """Transcribe an already-stored audio file (server-side path) to text."""
    resolved = config.resolve_storage_path(data.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    from ..utils.audio import load_audio

    audio, sr = await asyncio.to_thread(load_audio, str(resolved))
    duration = len(audio) / sr

    from ..backends.configs import get_stt_model_configs

    model_size = data.model
    cloud_cfg = next((c for c in get_stt_model_configs() if c.model_size == model_size), None) if model_size else None
    if cloud_cfg is not None and cloud_cfg.engine == "cloud":
        try:
            text = await transcribe.transcribe_via_cloud_stt(str(resolved), data.language)
        except LookupError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return models.TranscriptionResponse(text=text, duration=duration)

    whisper_model = transcribe.get_whisper_model()
    model_size = model_size or whisper_model.model_size
    if model_size not in WHISPER_CPP_FILES:
        raise HTTPException(
            status_code=400,
            detail=ERR_INVALID_MODEL_SIZE.format(sizes=", ".join(WHISPER_CPP_FILES.keys())),
        )
    if not (whisper_model.is_loaded() and whisper_model.model_size == model_size):
        _assert_whisper_entitled(model_size)
        if not whisper_model._is_model_cached(model_size):
            from ..services.model_registry import MODEL_FILE_MISSING_MSG

            raise HTTPException(status_code=400, detail=MODEL_FILE_MISSING_MSG)
        await whisper_model.load_model_async(model_size)

    text = await whisper_model.transcribe(str(resolved), data.language, model_size)
    return models.TranscriptionResponse(text=text, duration=duration)


class SubtitleRequest(BaseModel):
    audio_path: str
    fmt: str = "srt"
    language: str | None = None
    model: str | None = None
    style: dict | None = None


@router.post("/transcription/export-subtitles")
async def export_subtitles_route(data: SubtitleRequest):
    """Transcribe a stored clip locally and export SRT/VTT/ASS subtitles."""
    from ..backends.configs import get_stt_model_configs
    from ..services.subtitles import export_subtitles as run_export

    model_size = data.model
    cloud_cfg = next((c for c in get_stt_model_configs() if c.model_size == model_size), None) if model_size else None
    if cloud_cfg is not None and cloud_cfg.engine == "cloud":
        from ..services.subtitles import export_subtitles_from_text as run_export_text

        try:
            storage_path, filename = await run_export_text(data.audio_path, data.fmt, data.language, data.style)
        except LookupError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"output_path": storage_path, "filename": filename}

    whisper_model = transcribe.get_whisper_model()
    model_size = model_size or whisper_model.model_size

    if model_size not in WHISPER_CPP_FILES:
        raise HTTPException(
            status_code=400,
            detail=ERR_INVALID_MODEL_SIZE.format(sizes=", ".join(WHISPER_CPP_FILES.keys())),
        )
    if not (whisper_model.is_loaded() and whisper_model.model_size == model_size):
        _assert_whisper_entitled(model_size)
        if not whisper_model._is_model_cached(model_size):
            from ..services.model_registry import MODEL_FILE_MISSING_MSG

            raise HTTPException(status_code=400, detail=MODEL_FILE_MISSING_MSG)
        await whisper_model.load_model_async(model_size)

    try:
        storage_path, filename = await run_export(data.audio_path, data.fmt, model_size, data.language, data.style)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"output_path": storage_path, "filename": filename}
