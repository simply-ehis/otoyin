"""Extended audio import with ffmpeg support."""

from pathlib import Path

from ..utils.hidden_subprocess import run_hidden
from .audio_conversion import ffmpeg_path

# Resolved at call time (not import time): honouring the bundled ffmpeg that
# ships next to a frozen Otoyin install must not add filesystem probing to
# process startup, and the result is cached inside ffmpeg_path() anyway.

# Inputs must be real local media files: no URLs (ffmpeg would happily fetch
# http://... — an SSRF vector), no UNC/network paths, and only extensions this
# module advertises as supported.
_MEDIA_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".flac",
    ".ogg",
    ".m4a",
    ".aac",
    ".aif",
    ".aiff",
    ".mp4",
    ".m4v",
    ".mov",
    ".mkv",
    ".webm",
}

_OUTPUT_FORMATS = {"wav", "mp3", "flac", "ogg", "m4a", "aac", "aiff"}

# Restrict ffmpeg's input side to local file reads so a crafted path can
# never open network protocols (http, tcp, smb, ...) from inside ffmpeg.
_FFMPEG_INPUT_GUARD = ["-nostdin", "-protocol_whitelist", "file,crypto"]


def check_ffmpeg_available() -> bool:
    return ffmpeg_path() is not None


def _validate_media_input(path_str: str) -> Path:
    """Reject anything that is not an existing local media file."""
    if path_str.startswith(("\\\\", "//")):
        raise ValueError("Network paths are not supported")
    if "://" in path_str:
        raise ValueError("URL inputs are not supported")
    resolved = Path(path_str).resolve()
    if resolved.suffix.lower() not in _MEDIA_EXTENSIONS:
        raise ValueError(f"Unsupported media extension: {resolved.suffix or '(none)'}")
    if not resolved.is_file():
        raise FileNotFoundError(f"Media file not found: {resolved}")
    return resolved


def get_supported_formats() -> list[dict]:
    formats = [
        {"ext": "wav", "type": "audio", "description": "WAV audio"},
        {"ext": "mp3", "type": "audio", "description": "MP3 audio"},
        {"ext": "flac", "type": "audio", "description": "FLAC audio"},
        {"ext": "ogg", "type": "audio", "description": "OGG audio"},
    ]
    if ffmpeg_path():
        formats.extend(
            [
                {"ext": "m4a", "type": "audio", "description": "M4A/AAC audio"},
                {"ext": "aac", "type": "audio", "description": "AAC audio"},
                {"ext": "aiff", "type": "audio", "description": "AIFF audio"},
                {"ext": "mp4", "type": "video", "description": "MP4 video (audio strip)"},
                {"ext": "mov", "type": "video", "description": "MOV video (audio strip)"},
                {"ext": "mkv", "type": "video", "description": "MKV video (audio strip)"},
                {"ext": "webm", "type": "video", "description": "WebM video (audio strip)"},
            ]
        )
    return formats


def extract_audio_from_video(
    video_path: str,
    output_path: str | None = None,
    sample_rate: int = 48000,
    channels: int = 1,
) -> str:
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found. Install ffmpeg to strip audio from video.")

    src = _validate_media_input(video_path)
    if output_path is None:
        output_path = str(src.with_suffix(".wav"))

    cmd = [
        ffmpeg,
        *_FFMPEG_INPUT_GUARD,
        "-i",
        str(src),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        str(sample_rate),
        "-ac",
        str(channels),
        "-y",
        output_path,
    ]
    result = run_hidden(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")
    return output_path


def convert_audio(
    input_path: str,
    output_path: str | None = None,
    target_format: str = "wav",
    sample_rate: int = 48000,
    channels: int = 1,
) -> str:
    fmt = target_format.lower().lstrip(".")
    if fmt not in _OUTPUT_FORMATS:
        raise ValueError(f"Unsupported target format: {target_format}")

    src = _validate_media_input(input_path)
    if output_path is None:
        output_path = str(src.with_suffix(f".{fmt}"))

    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found. Install ffmpeg for format conversion.")

    cmd = [
        ffmpeg,
        *_FFMPEG_INPUT_GUARD,
        "-i",
        str(src),
        "-ar",
        str(sample_rate),
        "-ac",
        str(channels),
        "-y",
        output_path,
    ]
    result = run_hidden(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")
    return output_path


def get_audio_info(file_path: str) -> dict:
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        return {"error": "ffmpeg not available"}
    try:
        src = _validate_media_input(file_path)
    except (ValueError, OSError) as e:
        return {"error": str(e)}
    cmd = [ffmpeg, *_FFMPEG_INPUT_GUARD, "-i", str(src), "-f", "null", "-"]
    result = run_hidden(cmd, capture_output=True, text=True, timeout=30)
    stderr = result.stderr
    info = {}
    for line in stderr.split("\n"):
        line = line.strip()
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip()
            info["duration"] = parts
        if "Audio:" in line:
            parts = line.split("Audio:")[1].split(",")[0].strip()
            info["codec"] = parts
        if "Hz" in line:
            for part in line.split(","):
                part = part.strip()
                if "Hz" in part:
                    info["sample_rate"] = part.replace("Hz", "").strip()
                if "stereo" in part or "mono" in part:
                    info["channels"] = part.strip()
    return info
