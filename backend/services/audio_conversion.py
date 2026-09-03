"""Audio format conversion + .m4b export helpers (ffmpeg, offline)."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

SUPPORTED_FORMATS = {
    "wav": {"ext": "wav", "codec": "pcm_s16le", "mime": "audio/wav"},
    "mp3": {"ext": "mp3", "codec": "libmp3lame", "mime": "audio/mpeg"},
    "m4a": {"ext": "m4a", "codec": "aac", "mime": "audio/mp4"},
    "m4b": {"ext": "m4b", "codec": "aac", "mime": "audio/mp4"},
    "flac": {"ext": "flac", "codec": "flac", "mime": "audio/flac"},
    "ogg": {"ext": "ogg", "codec": "libvorbis", "mime": "audio/ogg"},
    "opus": {"ext": "opus", "codec": "libopus", "mime": "audio/opus"},
}


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def convert_audio_file(
    input_path: str | Path,
    output_format: str,
    bitrate: str = "128k",
    sample_rate: int | None = None,
) -> Path:
    """Convert `input_path` to `output_format` via ffmpeg. Returns output Path."""
    fmt = output_format.lower().lstrip(".")
    if fmt not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {output_format} (supported: {', '.join(SUPPORTED_FORMATS)})")
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg not found on PATH — cannot convert audio")

    inp = Path(input_path)
    if not inp.exists():
        raise FileNotFoundError(str(inp))

    tmp = Path(tempfile.mktemp(suffix=f".{SUPPORTED_FORMATS[fmt]['ext']}"))
    codec = SUPPORTED_FORMATS[fmt]["codec"]
    cmd = ["ffmpeg", "-y", "-i", str(inp), "-c:a", codec]
    if fmt in ("mp3", "m4a", "m4b", "ogg", "opus"):
        cmd += ["-b:a", bitrate]
    if sample_rate:
        cmd += ["-ar", str(sample_rate)]
    if fmt in ("m4a", "m4b"):
        cmd += ["-movflags", "+faststart"]
    cmd.append(str(tmp))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0 or not tmp.exists():
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:800]}")
    return tmp


def build_m4b(
    chapter_wavs: list[Path],
    chapter_titles: list[str],
    output_path: Path,
    cover_path: Path | None = None,
    author: str | None = None,
    title: str | None = None,
    bitrate: str = "64k",
) -> Path:
    """Concat chapter WAVs → single .m4b with chapter marks + optional cover."""
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg not found — cannot build .m4b")
    if not chapter_wavs:
        raise ValueError("No chapters to export")

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        concat_list = td_path / "concat.txt"
        concat_list.write_text("\n".join(f"file '{p.resolve()}'" for p in chapter_wavs), encoding="utf-8")

        # Build FFmetadata with chapters
        meta = td_path / "chapters.txt"
        lines = [";FFMETADATA1"]
        if title:
            lines.append(f"title={title}")
        if author:
            lines.append(f"artist={author}")
            lines.append(f"album={title or author}")
        # Durations via ffprobe or WAV header
        durations_ms: list[int] = []
        for wav in chapter_wavs:
            try:
                import soundfile as sf

                info = sf.info(str(wav))
                durations_ms.append(int(info.duration * 1000))
            except Exception:
                durations_ms.append(30000)

        cursor = 0
        for _idx, (dur, ctitle) in enumerate(zip(durations_ms, chapter_titles, strict=False)):
            lines.append("[CHAPTER]")
            lines.append("TIMEBASE=1/1000")
            lines.append(f"START={cursor}")
            cursor += dur
            lines.append(f"END={cursor}")
            lines.append(f"title={ctitle}")
        meta.write_text("\n".join(lines), encoding="utf-8")

        # Intermediate concat wav
        concat_wav = td_path / "concat.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(concat_wav)],
            capture_output=True,
            timeout=300,
            check=False,
        )
        if not concat_wav.exists():
            # fallback: re-encode concat
            subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), str(concat_wav)],
                capture_output=True,
                timeout=300,
                check=True,
            )

        cmd = ["ffmpeg", "-y", "-i", str(concat_wav), "-i", str(meta)]
        if cover_path and cover_path.exists():
            cmd += ["-i", str(cover_path)]
            # map: 0 audio, 1 metadata, 2 cover
            cmd += [
                "-map",
                "0:a",
                "-map",
                "1",
                "-map",
                "2",
                "-c:a",
                "aac",
                "-b:a",
                bitrate,
                "-c:v",
                "copy",
                "-disposition:v",
                "attached_pic",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        else:
            cmd += [
                "-map",
                "0:a",
                "-map_metadata",
                "1",
                "-c:a",
                "aac",
                "-b:a",
                bitrate,
                "-movflags",
                "+faststart",
                str(output_path),
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0 or not output_path.exists():
            raise RuntimeError(f"m4b build failed: {result.stderr[:1000]}")
    return output_path
