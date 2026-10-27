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

    # Duration in seconds: max segment end time, or 0 if no segments
    duration_sec = max((s.end for s in job.segments), default=0.0)

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
        "duration": duration_sec * 1000,  # ms — matches frontend expectation
    }


@router.get("/dubbing/analyze/{job_id}")
async def analyze_dubbing_job(job_id: str):
    """Return onsets, peaks envelope, and duration for a dub job's timeline.

    Onsets come from segment start/end boundaries.  Peaks are a 256-point
    RMS envelope sampled across the job duration.  Falls back gracefully when
    segment audio files are unavailable.
    """
    job = dubbing.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)

    if not job.segments:
        return {"onsets": [], "peaks": [], "duration": 0.0}

    # --- Onsets: sorted unique segment boundaries ---
    boundary_set: set[float] = set()
    for s in job.segments:
        boundary_set.add(s.start)
        boundary_set.add(s.end)
    onsets = sorted(boundary_set)

    # --- Duration: max segment end ---
    duration_sec = max(s.end for s in job.segments)

    # --- Peaks: 256-point RMS envelope from segment audio files ---
    resolution = 256
    import soundfile as sf

    peaks = [0.0] * resolution

    for s in job.segments:
        if not s.audio_path:
            continue
        path = Path(s.audio_path)
        if not path.is_file():
            continue
        try:
            data, _sr = await asyncio.to_thread(sf.read, str(path), always_2d=False)
            if data.ndim > 1:
                data = data.mean(axis=1)
            block_samples = max(1, len(data) // resolution)
            for i in range(resolution):
                start_i = i * block_samples
                end_i = min((i + 1) * block_samples, len(data))
                if end_i <= start_i:
                    break
                block = data[start_i:end_i]
                rms = float((block**2).mean() ** 0.5) if len(block) else 0.0
                peaks[i] = max(peaks[i], rms)
        except Exception as exc:
            logger.warning("Failed to compute peaks for segment %d: %s", s.id, exc)
            continue

    # Normalise peaks to [0, 1]
    max_peak = max(peaks) if peaks else 0.0
    if max_peak > 0:
        peaks = [p / max_peak for p in peaks]

    return {"onsets": onsets, "peaks": peaks, "duration": duration_sec}


@router.post("/dubbing/cancel/{job_id}")
async def cancel_dubbing(job_id: str):
    """Cancel a running dubbing job."""
    if dubbing.cancel_job(job_id):
        return {"cancelled": True}
    raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)


@router.get("/dubbing/job/{job_id}/segment/{segment_id}/audio")
async def get_dubbing_segment_audio(job_id: str, segment_id: int):
    """Serve the synthesized audio for a single dub segment."""
    job = dubbing.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)

    segment = next((s for s in job.segments if s.id == segment_id), None)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    if not segment.audio_path:
        raise HTTPException(status_code=404, detail="Segment audio not available")

    path = Path(segment.audio_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Segment audio file missing")

    return FileResponse(path, media_type="audio/wav", filename=f"segment_{segment_id}.wav")


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


class DubSegmentPatch(BaseModel):
    start: float | None = None
    end: float | None = None
    translated_text: str | None = None


@router.patch("/dubbing/segment/{segment_id}")
def patch_dub_segment(segment_id: int, patch: DubSegmentPatch):
    """Move/resize a dub segment."""
    from ..services import dubbing as dub_svc

    for job in dub_svc._jobs.values():
        for seg in job.segments:
            if seg.id == segment_id:
                if patch.start is not None:
                    seg.start = patch.start
                if patch.end is not None:
                    seg.end = patch.end
                if patch.translated_text is not None:
                    seg.translated_text = patch.translated_text
                return {
                    "id": seg.id,
                    "start": seg.start,
                    "end": seg.end,
                    "original_text": seg.original_text,
                    "translated_text": seg.translated_text,
                    "speaker": seg.speaker,
                    "has_audio": seg.audio_path is not None,
                }
    raise HTTPException(status_code=404, detail="segment not found")


@router.delete("/dubbing/segment/{segment_id}")
def delete_dub_segment(segment_id: int):
    """Delete a dub segment."""
    from ..services import dubbing as dub_svc

    for job in dub_svc._jobs.values():
        for i, seg in enumerate(job.segments):
            if seg.id == segment_id:
                job.segments.pop(i)
                job.total_segments = len(job.segments)
                return {"deleted": segment_id}
    raise HTTPException(status_code=404, detail="segment not found")
