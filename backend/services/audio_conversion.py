"""Audio format conversion + .m4b export helpers (ffmpeg, offline).

Also owns the single ffmpeg resolver: a frozen Otoyin build ships its own ffmpeg
next to the sidecar, so a bare ``"ffmpeg"`` on PATH is not enough. Every ffmpeg
call site must go through :func:`ffmpeg_path`.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from functools import lru_cache
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

# Formats encoded at a fixed bitrate. Vorbis is deliberately excluded: libvorbis
# is a VBR codec and fails to open the encoder for arbitrary bitrates (e.g. 128k
# errors with "Error while opening encoder"), so ogg uses quality mode instead.
_BITRATE_FORMATS = frozenset({"mp3", "m4a", "m4b", "opus"})

# libvorbis quality scale (-1..10); 5 is roughly 128kbps-equivalent transparency.
OGG_QUALITY = 5

_EXE = ".exe" if sys.platform == "win32" else ""


def _candidate_dirs() -> list[Path]:
    """Directories that may hold a bundled ffmpeg, most specific first.

    A frozen install puts the server at ``<resources>/otoyin-server/`` and the
    bundled ffmpeg at ``<resources>/ffmpeg/bin/``, so the executable's own
    directory *and its parent* both need checking.
    """
    dirs: list[Path] = []

    override = os.environ.get("OTOYIN_FFMPEG")
    if override:
        dirs.append(Path(override).parent)

    # PyInstaller onedir: binaries live beside sys.executable.
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        dirs += [exe_dir, exe_dir.parent]
    else:  # dev: repo root / backend
        here = Path(__file__).resolve()
        dirs += [here.parent.parent.parent, here.parent.parent]

    # Expand over a snapshot — appending into the list being iterated is an
    # infinite loop (the list grows as fast as it is consumed).
    expanded: list[Path] = []
    for base in list(dirs):
        expanded += [base / "ffmpeg" / "bin", base / "ffmpeg", base / "bin"]
    return expanded


@lru_cache(maxsize=1)
def ffmpeg_path() -> str | None:
    """Absolute path to a usable ffmpeg, or None.

    Resolution order: OTOYIN_FFMPEG override -> bundled alongside the app ->
    PATH. Cached, so repeated conversions do no filesystem probing; call
    :func:`ffmpeg_cache_clear` if ffmpeg is installed while the app is running.
    """
    override = os.environ.get("OTOYIN_FFMPEG")
    if override and Path(override).is_file():
        return override

    for d in _candidate_dirs():
        cand = d / f"ffmpeg{_EXE}"
        if cand.is_file():
            return str(cand)

    return shutil.which("ffmpeg")


def ffmpeg_cache_clear() -> None:
    """Forget the cached ffmpeg path (after installing ffmpeg at runtime)."""
    ffmpeg_path.cache_clear()


def ffmpeg_available() -> bool:
    return ffmpeg_path() is not None


def _require_ffmpeg() -> str:
    path = ffmpeg_path()
    if not path:
        raise RuntimeError("ffmpeg not found — cannot convert audio (set OTOYIN_FFMPEG or install ffmpeg)")
    return path


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
    # Validate caller input before touching the environment: a bad argument is a
    # bad argument whether or not ffmpeg happens to be installed.
    if not re.match(r"^\d+[kKmM]?$", bitrate):
        raise ValueError(f"Invalid bitrate: {bitrate!r} (expected e.g. '128k', '64k', '320k')")

    inp = Path(input_path)
    if not inp.exists():
        raise FileNotFoundError(str(inp))

    ffmpeg = _require_ffmpeg()

    tmp = Path(tempfile.mktemp(suffix=f".{SUPPORTED_FORMATS[fmt]['ext']}"))
    codec = SUPPORTED_FORMATS[fmt]["codec"]
    cmd = [ffmpeg, "-y", "-i", str(inp), "-c:a", codec]
    if fmt in _BITRATE_FORMATS:
        cmd += ["-b:a", bitrate]
    if fmt == "ogg":
        cmd += ["-q:a", str(OGG_QUALITY)]
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
    ffmpeg = _require_ffmpeg()
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
            # Sanitize chapter title for FFmetadata — strip control chars and =, \n
            safe_title = re.sub(r"[\x00-\x1f\x7f=]", "", ctitle).replace("\n", " ")[:200]
            lines.append("[CHAPTER]")
            lines.append("TIMEBASE=1/1000")
            lines.append(f"START={cursor}")
            cursor += dur
            lines.append(f"END={cursor}")
            lines.append(f"title={safe_title}")
        meta.write_text("\n".join(lines), encoding="utf-8")

        # Intermediate concat wav
        concat_wav = td_path / "concat.wav"
        subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(concat_wav)],
            capture_output=True,
            timeout=300,
            check=False,
        )
        if not concat_wav.exists():
            # fallback: re-encode concat
            subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), str(concat_wav)],
                capture_output=True,
                timeout=300,
                check=True,
            )

        cmd = [ffmpeg, "-y", "-i", str(concat_wav), "-i", str(meta)]
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
