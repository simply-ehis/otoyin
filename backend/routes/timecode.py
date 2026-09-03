"""SMPTE timecode display endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

SUPPORTED_FRAME_RATES = [
    {"fps": 23.976, "label": "23.976 fps (Film NTSC)"},
    {"fps": 24.0, "label": "24 fps (Film)"},
    {"fps": 25.0, "label": "25 fps (PAL)"},
    {"fps": 29.97, "label": "29.97 fps (NTSC)"},
    {"fps": 30.0, "label": "30 fps"},
]


class TimecodeRequest(BaseModel):
    seconds: float
    fps: float = 24.0


class TimecodeToSecondsRequest(BaseModel):
    hours: int
    minutes: int
    seconds: int
    frames: int
    fps: float = 24.0


class TimecodeDisplay(BaseModel):
    hours: int
    minutes: int
    seconds: int
    frames: int
    display: str


@router.get("/timecode/frame-rates")
async def list_frame_rates():
    return SUPPORTED_FRAME_RATES


@router.post("/timecode/convert")
async def seconds_to_timecode(data: TimecodeRequest):
    """Convert seconds to SMPTE timecode string."""
    total_frames = round(data.seconds * data.fps)
    fps_int = round(data.fps)
    frames_per_second = fps_int
    frames_per_minute = frames_per_second * 60
    frames_per_hour = frames_per_minute * 60

    hours = total_frames // frames_per_hour
    remainder = total_frames % frames_per_hour
    minutes = remainder // frames_per_minute
    remainder = remainder % frames_per_minute
    secs = remainder // frames_per_second
    frames = remainder % frames_per_second

    display = f"{hours:02d}:{minutes:02d}:{secs:02d}:{frames:02d}"
    return {
        "hours": hours,
        "minutes": minutes,
        "seconds": secs,
        "frames": frames,
        "display": display,
    }


@router.post("/timecode/to-seconds")
async def timecode_to_seconds(data: TimecodeToSecondsRequest):
    """Convert timecode components to seconds."""
    fps_int = round(data.fps)
    total_frames = (data.hours * 3600 + data.minutes * 60 + data.seconds) * fps_int + data.frames
    seconds = total_frames / data.fps
    return {"seconds": seconds}
