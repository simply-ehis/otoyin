"""Video dubbing endpoints."""

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..database import get_db
from ..errors import ERR_AUDIO_NOT_FOUND, ERR_DUBBED_NOT_READY, ERR_JOB_NOT_FOUND, ERR_OUTPUT_MISSING
from ..services import dubbing

logger = logging.getLogger(__name__)

router = APIRouter()


class DubRequest(BaseModel):
    video_path: str
    target_lang: str
    profile_id: str
    engine: str = "kokoro"
    source_lang: str | None = None
    num_speakers: int | None = None


class DubPreviewRequest(BaseModel):
    video_path: str
    source_lang: str | None = None
    num_speakers: int | None = None


@router.post("/dubbing/dub")
async def start_dubbing(data: DubRequest, background_tasks: BackgroundTasks):
    """Start a full video dubbing job (async)."""
    from ..config import resolve_storage_path

    resolved = resolve_storage_path(data.video_path)
    if resolved is None:
        raise HTTPException(status_code=403, detail="Access denied: path outside allowed directory")
    video = resolved
    if not video.is_file():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    job_id = dubbing.create_job()
    job = dubbing.get_job(job_id)
    job.target_lang = data.target_lang
    job.source_lang = data.source_lang

    # Run pipeline in background — don't leak the request-scoped DB session
    async def _runner():
        # Create a fresh DB session for the background job
        bg_db = next(get_db())
        try:
            await dubbing.run_dubbing(
                job_id=job_id,
                video_path=str(video),
                target_lang=data.target_lang,
                profile_id=data.profile_id,
                engine=data.engine,
                source_lang=data.source_lang,
                num_speakers=data.num_speakers,
                db_session=bg_db,
            )
        finally:
            import contextlib

            with contextlib.suppress(Exception):
                bg_db.close()

    background_tasks.add_task(asyncio.create_task, _runner())

    return {"job_id": job_id, "status": "pending"}


@router.get("/dubbing/job/{job_id}")
async def get_dubbing_job(job_id: str):
    """Get dubbing job status and progress."""
    job = dubbing.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)

    segments = [
        {
            "id": s.id,
            "start": s.start,
            "end": s.end,
            "original_text": s.original_text,
            "translated_text": s.translated_text,
            "speaker": s.speaker,
            "has_audio": s.audio_path is not None,
        }
        for s in job.segments
    ]

    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "source_lang": job.source_lang,
        "target_lang": job.target_lang,
        "total_segments": job.total_segments,
        "completed_segments": job.completed_segments,
        "segments": segments,
        "output_path": job.output_path,
        "error": job.error,
    }


@router.post("/dubbing/cancel/{job_id}")
async def cancel_dubbing(job_id: str):
    """Cancel a running dubbing job."""
    if dubbing.cancel_job(job_id):
        return {"cancelled": True}
    raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)


@router.get("/dubbing/download/{job_id}")
async def download_dubbed_video(job_id: str):
    """Download the dubbed video file."""
    job = dubbing.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)
    if job.status != "done" or not job.output_path:
        raise HTTPException(status_code=400, detail=ERR_DUBBED_NOT_READY)
    path = Path(job.output_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=ERR_OUTPUT_MISSING)
    return FileResponse(path, media_type="video/mp4", filename=f"dubbed_{job_id}.mp4")


@router.post("/dubbing/preview")
async def preview_dubbing(data: DubPreviewRequest):
    """Preview dubbing for a short segment of a video."""
    from ..config import resolve_storage_path

    resolved = resolve_storage_path(data.video_path)
    if resolved is None:
        raise HTTPException(status_code=403, detail="Access denied: path outside allowed directory")
    video = resolved
    if not video.is_file():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    import tempfile

    from ..services.extended_import import extract_audio_from_video

    with tempfile.TemporaryDirectory(prefix="dub_preview_") as tmp:
        audio_path = str(Path(tmp) / "preview.wav")
        extract_audio_from_video(str(video), output_path=audio_path, sample_rate=44100, channels=1)

        # Transcribe
        transcript = await asyncio.to_thread(dubbing._transcribe_with_segments, audio_path, data.source_lang)

        # Try diarization
        speaker_segments = await asyncio.to_thread(dubbing._diarize, audio_path, data.num_speakers)
        if speaker_segments:
            transcript = dubbing._align_speakers(transcript, speaker_segments)

    return {
        "segments": [
            {
                "id": s.id,
                "start": s.start,
                "end": s.end,
                "text": s.text,
                "speaker": s.speaker,
            }
            for s in transcript
        ],
        "detected_speakers": list({s.speaker for s in transcript}),
    }


@router.get("/dubbing/languages")
async def list_dubbing_languages():
    """List available target languages for dubbing."""
    from ..services.translation import SUPPORTED_LANGUAGES

    return {"languages": SUPPORTED_LANGUAGES}
