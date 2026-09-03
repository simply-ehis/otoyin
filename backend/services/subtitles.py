"""Subtitle / caption export from a local Whisper transcript.

Supports SRT, VTT, and ASS formats. Uses real Whisper segment timestamps
when available, falling back to proportional distribution by sentence length.
"""

import re

import soundfile as sf

from .. import config
from ..services.transcribe import get_whisper_model


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p.strip()]


def _format_time_srt(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_time_vtt(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _format_time_ass(seconds: float) -> str:
    """Format time as H:MM:SS.CC (centiseconds) for ASS."""
    seconds = max(0.0, float(seconds))
    cs = round(seconds * 100)
    h, cs = divmod(cs, 3_600_000)
    m, cs = divmod(cs, 60_000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _build_subs(text: str, duration: float) -> list[tuple[float, float, str]]:
    """Split text into sentence chunks and spread them across duration by length."""
    sentences = _split_sentences(text) or [text]
    lengths = [len(s) for s in sentences]
    total = sum(lengths) or 1
    subs: list[tuple[float, float, str]] = []
    start = 0.0
    for sent, length in zip(sentences, lengths, strict=False):
        end = start + duration * (length / total)
        subs.append((start, end, sent))
        start = end
    return subs


def _build_subs_from_segments(segments: list[dict]) -> list[tuple[float, float, str]]:
    """Build subtitle cues directly from Whisper segment timestamps."""
    return [(s["start"], s["end"], s["text"]) for s in segments if s.get("text", "").strip()]


def _format_srt(subs: list[tuple[float, float, str]]) -> str:
    lines = []
    for i, (start, end, text) in enumerate(subs, 1):
        lines.append(str(i))
        lines.append(f"{_format_time_srt(start)} --> {_format_time_srt(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _format_vtt(subs: list[tuple[float, float, str]]) -> str:
    lines = ["WEBVTT", ""]
    for start, end, text in subs:
        lines.append(f"{_format_time_vtt(start)} --> {_format_time_vtt(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _format_ass(subs: list[tuple[float, float, str]], style: dict | None = None) -> str:
    """Generate a full ASS (Advanced SubStation Alpha) subtitle file."""
    s = style or {}

    font = s.get("font_family", "Arial")
    font_size = s.get("font_size", 48)
    primary_color = s.get("primary_color", "&H00FFFFFF")
    outline_color = s.get("outline_color", "&H00000000")
    back_color = s.get("background_color", "&H80000000")
    position = s.get("position", "bottom")
    outline_w = s.get("outline_width", 2)
    shadow = s.get("shadow", 1)
    margin_v = s.get("margin_v", 30)
    bold = s.get("bold", False)
    italic = s.get("italic", False)

    alignment = {"top": 8, "center": 5, "bottom": 2}.get(position, 2)
    bold_val = -1 if bold else 0
    italic_val = -1 if italic else 0

    style_name = "Default"
    style_line = (
        f"Style: {style_name},{font},{font_size},"
        f"&H00{primary_color[2:]},{outline_color},{back_color},"
        f"{bold_val},{italic_val},0,0,"
        f"{outline_w},{shadow},0,0,{alignment},{margin_v},0,0,100,0,0,0,0,1,0,0"
    )

    events = []
    for start, end, text in subs:
        start_ass = _format_time_ass(start)
        end_ass = _format_time_ass(end)
        text_escaped = text.replace("\n", "\\N")
        events.append(f"Dialogue: 0,{start_ass},{end_ass},{style_name},,0,0,0,,{text_escaped}")

    return "\n".join(
        [
            "[Script Info]",
            "Title: otoyin Subtitles",
            "ScriptType: v4.00+",
            "PlayResX: 1920",
            "PlayResY: 1080",
            "Timer: 100.0000",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            style_line,
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
            *events,
            "",
        ]
    )


async def export_subtitles(
    audio_path: str,
    fmt: str = "srt",
    model_size: str | None = None,
    language: str | None = None,
    style: dict | None = None,
) -> tuple[str, str]:
    """Transcribe audio_path locally and write SRT/VTT/ASS to exports.

    Returns (storage_path, filename). Raises FileNotFoundError / RuntimeError.
    """
    fmt = (fmt or "srt").lower()
    if fmt not in ("srt", "vtt", "ass"):
        raise RuntimeError("fmt must be 'srt', 'vtt', or 'ass'")

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise FileNotFoundError("Audio file not found")

    info = sf.info(str(resolved))
    duration = info.frames / info.samplerate

    whisper_model = get_whisper_model()

    # Try to get real segment timestamps
    try:
        result = await whisper_model.transcribe_with_segments(str(resolved), language, model_size)
        segments = result.get("segments", [])
        if segments:
            subs = _build_subs_from_segments(segments)
        else:
            text = result.get("text", "")
            subs = _build_subs(text, duration)
    except (AttributeError, TypeError):
        # Fallback for backends that don't implement transcribe_with_segments
        text = await whisper_model.transcribe(str(resolved), language, model_size) or ""
        subs = _build_subs(text, duration)

    suffix = {"srt": "srt", "vtt": "vtt", "ass": "ass"}[fmt]
    filename = f"subtitles_{abs(hash(str(resolved))) % 10**8:08d}.{suffix}"
    out_path = config.get_exports_dir() / filename

    if fmt == "ass":
        content = _format_ass(subs, style)
    elif fmt == "vtt":
        content = _format_vtt(subs)
    else:
        content = _format_srt(subs)

    out_path.write_text(content, encoding="utf-8")
    return config.to_storage_path(out_path), filename


async def export_subtitles_from_text(
    audio_path: str,
    fmt: str = "srt",
    language: str | None = None,
    style: dict | None = None,
) -> tuple[str, str]:
    """Transcribe ``audio_path`` via the BYOK cloud STT provider and write subtitles.

    Cloud STT returns plain text (no segment timestamps), so the whole clip
    becomes a single subtitle cue spanning its duration. Returns
    ``(storage_path, filename)``. Raises ``LookupError`` if no provider is set.
    """
    from .transcribe import transcribe_via_cloud_stt

    fmt = (fmt or "srt").lower()
    if fmt not in ("srt", "vtt", "ass"):
        raise RuntimeError("fmt must be 'srt', 'vtt', or 'ass'")

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise FileNotFoundError("Audio file not found")

    info = sf.info(str(resolved))
    duration = info.frames / info.samplerate

    text = await transcribe_via_cloud_stt(str(resolved), language)
    subs = _build_subs(text or "", duration)

    suffix = {"srt": "srt", "vtt": "vtt", "ass": "ass"}[fmt]
    filename = f"subtitles_{abs(hash(str(resolved))) % 10**8:08d}.{suffix}"
    out_path = config.get_exports_dir() / filename

    if fmt == "ass":
        content = _format_ass(subs, style)
    elif fmt == "vtt":
        content = _format_vtt(subs)
    else:
        content = _format_srt(subs)

    out_path.write_text(content, encoding="utf-8")
    return config.to_storage_path(out_path), filename
