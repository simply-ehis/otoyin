"""
Transcription and diarization models — STT requests, responses, and subtitles.
"""

from pydantic import BaseModel, Field


class TranscriptionRequest(BaseModel):
    """Request model for audio transcription."""

    language: str | None = Field(None, pattern="^(en|zh|ja|ko|de|fr|ru|pt|es|it)$")
    model: str | None = Field(None, pattern="^(tiny\\.en|base\\.en|cloud)$")


class TranscriptionResponse(BaseModel):
    """Response model for transcription."""

    text: str
    duration: float
    segments: list[dict] = []


class DiarizationSegment(BaseModel):
    """A speaker-tagged transcript segment."""

    start: float
    end: float
    text: str
    speaker: str


class DiarizationResponse(BaseModel):
    """Response model for speaker diarization."""

    text: str
    duration: float
    segments: list[DiarizationSegment]
    speakers: list[str]
    diarized: bool
    language: str | None = None
    model: str | None = None


class SubtitleSegment(BaseModel):
    """A single subtitle segment with timing."""

    start: float
    end: float
    text: str


class SubtitleStyle(BaseModel):
    """Styling options for ASS subtitle export."""

    font_family: str = "Arial"
    font_size: int = 48
    primary_color: str = "&H00FFFFFF"
    outline_color: str = "&H00000000"
    background_color: str = "&H80000000"
    position: str = "bottom"
    outline_width: int = 2
    shadow: int = 1
    margin_v: int = 30
    bold: bool = False
    italic: bool = False
