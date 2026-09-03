"""YouTube / URL audio/video download via yt-dlp.

Downloads media from YouTube, SoundCloud, Vimeo, and 1000+ other sites.
Extracts audio as WAV/MP3/FLAC or downloads full video.
"""

import logging
import re
import uuid
from dataclasses import dataclass, field

from ..utils.ssrf import resolve_safe_redirects

logger = logging.getLogger(__name__)

# task_ids are server-generated as uuid4().hex[:12]; anything else is rejected
# before it can reach the filesystem.
_TASK_ID_RE = re.compile(r"^[a-f0-9]{12}$")


def is_valid_task_id(task_id: str) -> bool:
    """True only for a server-generated task id (12 lowercase hex chars)."""
    return bool(_TASK_ID_RE.match(task_id or ""))


def _require_safe_url(url: str) -> str:
    """Resolve redirects and raise RuntimeError if any hop hits a private/internal network.

    Returns the final safe URL so callers pass the post-redirect target to yt-dlp,
    which would otherwise follow a malicious 302 to an internal address unchecked.
    """
    try:
        return resolve_safe_redirects(url)
    except (ValueError, RuntimeError) as e:
        raise RuntimeError(f"URL is blocked (private/internal network): {e}") from e


@dataclass
class VideoInfo:
    title: str
    duration: float
    thumbnail: str
    uploader: str
    webpage_url: str
    formats: list[dict] = field(default_factory=list)


@dataclass
class DownloadResult:
    task_id: str
    file_path: str
    title: str
    duration: float
    thumbnail: str
    uploader: str


@dataclass
class DownloadProgress:
    task_id: str
    status: str  # "downloading" | "converting" | "completed" | "failed"
    percent: float = 0.0
    speed: str = ""
    eta: str = ""
    error: str = ""


# In-memory progress tracking
_progress: dict[str, DownloadProgress] = {}


def _is_available() -> bool:
    """Check if yt-dlp is installed."""
    try:
        import yt_dlp  # noqa: F401

        return True
    except ImportError:
        return False


async def get_video_info(url: str) -> VideoInfo:
    """Extract metadata from a URL without downloading."""
    url = _require_safe_url(url)
    if not _is_available():
        raise RuntimeError("yt-dlp is not installed. Install with: pip install yt-dlp")

    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        raise RuntimeError(f"Failed to extract info from URL: {e}") from e

    return VideoInfo(
        title=info.get("title", "Unknown"),
        duration=float(info.get("duration", 0)),
        thumbnail=info.get("thumbnail", ""),
        uploader=info.get("uploader", "Unknown"),
        webpage_url=info.get("webpage_url", url),
        formats=[
            {
                "format_id": f.get("format_id", ""),
                "ext": f.get("ext", ""),
                "resolution": f.get("resolution", "audio only"),
                "filesize": f.get("filesize"),
            }
            for f in (info.get("formats") or [])[:20]
        ],
    )


async def download_media(
    url: str,
    output_format: str = "audio",
    audio_format: str = "wav",
) -> DownloadResult:
    """Download media from a URL.

    Args:
        url: Media URL (YouTube, SoundCloud, Vimeo, etc.)
        output_format: "audio" for audio extraction, "video" for full video
        audio_format: Target audio format when output_format is "audio" (wav/mp3/flac)
    """
    if not _is_available():
        raise RuntimeError("yt-dlp is not installed. Install with: pip install yt-dlp")
    url = _require_safe_url(url)

    from ..config import get_downloads_dir

    task_id = uuid.uuid4().hex[:12]
    output_dir = get_downloads_dir() / task_id
    output_dir.mkdir(parents=True, exist_ok=True)

    _progress[task_id] = DownloadProgress(task_id=task_id, status="downloading")

    import yt_dlp

    def _progress_hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
            downloaded = d.get("downloaded_bytes", 0)
            pct = (downloaded / total * 100) if total else 0
            speed = d.get("speed")
            eta = d.get("eta")
            _progress[task_id] = DownloadProgress(
                task_id=task_id,
                status="downloading",
                percent=pct,
                speed=f"{speed / 1024 / 1024:.1f} MB/s" if speed else "",
                eta=f"{eta}s" if eta else "",
            )
        elif d["status"] == "finished":
            _progress[task_id] = DownloadProgress(
                task_id=task_id,
                status="converting",
                percent=100.0,
            )

    if output_format == "audio":
        outtmpl = str(output_dir / "audio.%(ext)s")
        postprocessors = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": audio_format if audio_format != "wav" else "wav",
                "preferredquality": "0" if audio_format == "mp3" else None,
            }
        ]
        ydl_format = "bestaudio/best"
    else:
        outtmpl = str(output_dir / "video.%(ext)s")
        postprocessors = []
        ydl_format = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

    ydl_opts = {
        "outtmpl": outtmpl,
        "format": ydl_format,
        "postprocessors": [
            p
            for p in postprocessors
            if p.get("preferredquality") is not None or p["key"] != "FFmpegExtractAudio" or audio_format == "wav"
        ],
        "progress_hooks": [_progress_hook],
        "quiet": True,
        "no_warnings": True,
    }

    # For wav output, use ffmpeg postprocessor with codec wav
    if output_format == "audio" and audio_format == "wav":
        ydl_opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "wav", "preferredquality": "0"},
        ]

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:
        _progress[task_id] = DownloadProgress(task_id=task_id, status="failed", error=str(e))
        raise RuntimeError(f"Download failed: {e}") from e

    # Find the downloaded file
    downloaded_files = list(output_dir.iterdir())
    if not downloaded_files:
        _progress[task_id] = DownloadProgress(task_id=task_id, status="failed", error="No output file found")
        raise RuntimeError("Download completed but no output file was found")

    result_file = downloaded_files[0]

    _progress[task_id] = DownloadProgress(task_id=task_id, status="completed", percent=100.0)

    return DownloadResult(
        task_id=task_id,
        file_path=str(result_file),
        title=info.get("title", "Unknown"),
        duration=float(info.get("duration", 0)),
        thumbnail=info.get("thumbnail", ""),
        uploader=info.get("uploader", "Unknown"),
    )


def get_progress(task_id: str) -> DownloadProgress | None:
    """Get download progress for a task."""
    return _progress.get(task_id)


def cleanup_task(task_id: str) -> None:
    """Remove progress entry and downloaded files for a task."""
    if not is_valid_task_id(task_id):
        return
    from ..config import get_downloads_dir

    progress = _progress.pop(task_id, None)
    if progress:
        base = get_downloads_dir().resolve()
        task_dir = (base / task_id).resolve()
        if task_dir.exists() and task_dir.is_relative_to(base):
            import shutil

            shutil.rmtree(task_dir, ignore_errors=True)
