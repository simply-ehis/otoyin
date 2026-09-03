"""YouTube / URL download endpoints."""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..errors import ERR_AUDIO_NOT_FOUND, ERR_TASK_NOT_FOUND
from ..services.youtube_download import is_valid_task_id

logger = logging.getLogger(__name__)

router = APIRouter()


class YoutubeInfoRequest(BaseModel):
    url: str


class YoutubeDownloadRequest(BaseModel):
    url: str
    output_format: str = "audio"  # "audio" | "video"
    audio_format: str = "wav"  # "wav" | "mp3" | "flac"


@router.post("/youtube/info")
async def get_youtube_info(data: YoutubeInfoRequest):
    """Extract metadata from a URL without downloading."""
    from ..services.youtube_download import get_video_info

    try:
        info = await get_video_info(data.url)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail="That link doesn't resolve to a playable source") from e

    return {
        "title": info.title,
        "duration": info.duration,
        "thumbnail": info.thumbnail,
        "uploader": info.uploader,
        "webpage_url": info.webpage_url,
        "formats": info.formats,
    }


@router.post("/youtube/download")
async def start_youtube_download(data: YoutubeDownloadRequest):
    """Start downloading media from a URL. Returns a task_id for progress tracking."""
    from ..services.youtube_download import download_media

    try:
        result = await download_media(
            url=data.url,
            output_format=data.output_format,
            audio_format=data.audio_format,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail="That link doesn't resolve to a playable source") from e

    return {
        "task_id": result.task_id,
        "file_path": result.file_path,
        "title": result.title,
        "duration": result.duration,
        "thumbnail": result.thumbnail,
        "uploader": result.uploader,
    }


@router.get("/youtube/progress/{task_id}")
async def get_youtube_progress(task_id: str):
    """Get download progress for a task."""
    if not is_valid_task_id(task_id):
        raise HTTPException(status_code=400, detail="That task ID isn't valid")
    from ..services.youtube_download import get_progress

    progress = get_progress(task_id)
    if progress is None:
        raise HTTPException(status_code=404, detail=ERR_TASK_NOT_FOUND)

    return {
        "task_id": progress.task_id,
        "status": progress.status,
        "percent": progress.percent,
        "speed": progress.speed,
        "eta": progress.eta,
        "error": progress.error,
    }


@router.get("/youtube/file/{task_id}")
async def download_youtube_file(task_id: str):
    """Stream the downloaded file back to the client."""
    import mimetypes

    from ..config import get_downloads_dir
    from ..services.youtube_download import get_progress, is_valid_task_id

    if not is_valid_task_id(task_id):
        raise HTTPException(status_code=400, detail="That task ID isn't valid")

    progress = get_progress(task_id)
    if progress is None:
        raise HTTPException(status_code=404, detail=ERR_TASK_NOT_FOUND)

    if progress.status != "completed":
        raise HTTPException(status_code=400, detail=f"Download still in progress: {progress.status}")

    base = get_downloads_dir().resolve()
    task_dir = (base / task_id).resolve()
    if not task_dir.is_relative_to(base):
        raise HTTPException(status_code=400, detail="That task ID isn't valid")
    files = list(task_dir.iterdir())
    if not files:
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    file_path = files[0]
    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"

    def _iter_file():
        with open(file_path, "rb") as f:
            while chunk := f.read(1024 * 1024):
                yield chunk

    return StreamingResponse(
        _iter_file(),
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{file_path.name}"',
            "Content-Length": str(file_path.stat().st_size),
        },
    )


@router.delete("/youtube/tasks/{task_id}")
async def delete_youtube_task(task_id: str):
    """Clean up a download task and its files."""
    if not is_valid_task_id(task_id):
        raise HTTPException(status_code=400, detail="That task ID isn't valid")
    from ..services.youtube_download import cleanup_task

    cleanup_task(task_id)
    return {"status": "deleted"}
