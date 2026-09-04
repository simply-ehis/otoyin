"""Speaker diarization endpoints."""

import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import config, models
from ..backends.whisper_cpp_backend import WHISPER_CPP_FILES
from ..errors import ERR_AUDIO_NOT_FOUND, ERR_DIARIZATION_FAILED
from ..services import diarization, transcribe
from ..utils.model_lifecycle import lifecycle_manager

router = APIRouter()

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB


def _assert_whisper_entitled(model_size: str) -> None:
    """Manifest gate for STT: only downloaded models may load. Never auto-downloads."""
    from ..backends.configs import get_stt_model_configs
    from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG, is_downloaded

    cfg = next((c for c in get_stt_model_configs() if c.model_size == model_size), None)
    if cfg is None or not is_downloaded(cfg.model_name, cfg.model_size):
        raise HTTPException(status_code=400, detail=MODEL_NOT_DOWNLOADED_MSG)


def _resolve_stt_model(model: str | None, whisper_model) -> str:
    """Validate the requested STT model size or fall back to the default."""
    model_size = model if model else whisper_model.model_size
    if model_size not in WHISPER_CPP_FILES:
        sizes = ", ".join(WHISPER_CPP_FILES.keys())
        raise HTTPException(
            status_code=400,
            detail=f"That model variant isn't available. Supported: {sizes}",
        )
    return model_size


async def _check_stt_ready(whisper_model, model_size: str) -> None:
    """Ensure the Whisper model is entitled, cached, and loaded."""
    _assert_whisper_entitled(model_size)
    if not (whisper_model.is_loaded() and whisper_model.model_size == model_size):
        if not whisper_model._is_model_cached(model_size):
            from ..services.model_registry import MODEL_FILE_MISSING_MSG

            raise HTTPException(status_code=400, detail=MODEL_FILE_MISSING_MSG)
        await whisper_model.load_model_async(model_size)


async def _build_response(
    whisper_model,
    audio_path: str,
    language: str | None,
    model_size: str,
    num_speakers: int | None,
) -> models.DiarizationResponse:
    """Run transcribe + diarize + align and build the response."""
    import soundfile as sf

    duration = float(sf.info(audio_path).duration)

    result = await whisper_model.transcribe_with_segments(audio_path, language, model_size)

    from types import SimpleNamespace

    transcript = [
        SimpleNamespace(
            start=seg.get("start", 0.0),
            end=seg.get("end", 0.0),
            text=seg.get("text", "").strip(),
            speaker="SPEAKER_00",
        )
        for seg in result.get("segments", [])
        if seg.get("text", "").strip()
    ]

    speaker_turns = await asyncio.to_thread(diarization.diarize_turns, audio_path, num_speakers)
    diarized = len({t.speaker for t in speaker_turns}) > 1
    if speaker_turns:
        transcript = diarization.align_speakers(transcript, speaker_turns)

    speakers = sorted({s.speaker for s in transcript})
    text = result.get("text", "").strip()
    return models.DiarizationResponse(
        text=text,
        duration=duration,
        segments=[
            models.DiarizationSegment(
                start=s.start,
                end=s.end,
                text=s.text,
                speaker=s.speaker,
            )
            for s in transcript
        ],
        speakers=speakers,
        diarized=diarized,
        language=language,
        model=model_size,
    )


@router.post("/diarize", response_model=models.DiarizationResponse)
async def diarize_audio(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    model: str | None = Form(None),
    num_speakers: int | None = Form(None),
):
    """Transcribe an uploaded audio file and tag each segment with a speaker."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        while chunk := await file.read(UPLOAD_CHUNK_SIZE):
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        whisper_model = transcribe.get_whisper_model()
        lifecycle_manager.mark_model_used("whisper")
        model_size = _resolve_stt_model(model, whisper_model)
        await _check_stt_ready(whisper_model, model_size)
        return await _build_response(whisper_model, tmp_path, language, model_size, num_speakers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_DIARIZATION_FAILED) from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)


class DiarizationPathRequest(BaseModel):
    audio_path: str
    language: str | None = None
    model: str | None = None
    num_speakers: int | None = None


@router.post("/diarize/path", response_model=models.DiarizationResponse)
async def diarize_audio_path(data: DiarizationPathRequest):
    """Transcribe an already-stored audio file (server-side path) and tag speakers."""
    resolved = config.resolve_storage_path(data.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    whisper_model = transcribe.get_whisper_model()
    lifecycle_manager.mark_model_used("whisper")
    model_size = _resolve_stt_model(data.model, whisper_model)
    await _check_stt_ready(whisper_model, model_size)
    return await _build_response(whisper_model, str(resolved), data.language, model_size, data.num_speakers)
