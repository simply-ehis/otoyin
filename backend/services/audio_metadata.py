"""Audio metadata (ID3, MP4, Vorbis comments) read/write for export tagging.

Supports MP3 (ID3v2.3), M4A/M4B (MP4 atoms), FLAC (Vorbis comments),
OGG (Vorbis comments), and OPUS (Vorbis comments). Cover art is embedded
as APIC (MP3) or covr (MP4) or METADATA_BLOCK_PICTURE (FLAC/OGG/OPUS).

All functions operate on filesystem paths and return the path they wrote,
so callers can chain conversion → metadata → save.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from mutagen import File as MutagenFile
    from mutagen.flac import FLAC, Picture
    from mutagen.id3 import APIC, ID3, TALB, TCON, TIT2, TPE1, TYER
    from mutagen.mp4 import MP4, MP4Cover
    from mutagen.oggopus import OggOpus
    from mutagen.oggvorbis import OggVorbis

    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    logger.warning("mutagen not installed — audio metadata export disabled")


@dataclass
class AudioMetadata:
    """Editable audio metadata fields for export."""

    title: str | None = None
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    year: str | None = None
    comment: str | None = None
    track_number: str | None = None
    cover_path: str | Path | None = None
    cover_data: bytes | None = None
    cover_mime: str = "image/jpeg"


@dataclass
class AudioMetadataResult:
    path: Path
    format: str
    fields_written: list[str] = field(default_factory=list)


def _require_mutagen() -> None:
    if not MUTAGEN_AVAILABLE:
        raise RuntimeError("mutagen is not installed — pip install mutagen for audio metadata export")


def _cover_bytes(metadata: AudioMetadata) -> tuple[bytes, str] | None:
    """Return (cover_bytes, mime) from cover_path or cover_data, or None."""
    if metadata.cover_data is not None:
        return metadata.cover_data, metadata.cover_mime
    if metadata.cover_path is not None:
        p = Path(metadata.cover_path)
        if p.exists():
            data = p.read_bytes()
            mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
            return data, mime
    return None


def _apply_id3(audio: ID3, metadata: AudioMetadata) -> list[str]:
    written: list[str] = []
    if metadata.title:
        audio["TIT2"] = TIT2(encoding=3, text=metadata.title)
        written.append("title")
    if metadata.artist:
        audio["TPE1"] = TPE1(encoding=3, text=metadata.artist)
        written.append("artist")
    if metadata.album:
        audio["TALB"] = TALB(encoding=3, text=metadata.album)
        written.append("album")
    if metadata.genre:
        audio["TCON"] = TCON(encoding=3, text=metadata.genre)
        written.append("genre")
    if metadata.year:
        audio["TYER"] = TYER(encoding=3, text=metadata.year)
        written.append("year")
    if metadata.comment:
        from mutagen.id3 import COMM

        audio["COMM"] = COMM(encoding=3, lang="eng", desc="", text=metadata.comment)
        written.append("comment")
    if metadata.track_number:
        from mutagen.id3 import TRCK

        audio["TRCK"] = TRCK(encoding=3, text=metadata.track_number)
        written.append("track_number")

    cover = _cover_bytes(metadata)
    if cover:
        data, mime = cover
        audio["APIC"] = APIC(
            encoding=3,
            mime=mime,
            type=3,  # Cover (front)
            desc="Cover",
            data=data,
        )
        written.append("cover")
    return written


def _apply_mp4(audio: MP4, metadata: AudioMetadata) -> list[str]:
    written: list[str] = []
    if metadata.title:
        audio["\xa9nam"] = [metadata.title]
        written.append("title")
    if metadata.artist:
        audio["\xa9ART"] = [metadata.artist]
        written.append("artist")
    if metadata.album:
        audio["\xa9alb"] = [metadata.album]
        written.append("album")
    if metadata.genre:
        audio["\xa9gen"] = [metadata.genre]
        written.append("genre")
    if metadata.year:
        audio["\xa9day"] = [metadata.year]
        written.append("year")
    if metadata.comment:
        audio["\xa9cmt"] = [metadata.comment]
        written.append("comment")
    if metadata.track_number:
        audio["trkn"] = [(int(metadata.track_number), 0)]
        written.append("track_number")

    cover = _cover_bytes(metadata)
    if cover:
        data, mime = cover
        mp4_format = MP4Cover.FORMAT_PNG if mime == "image/png" else MP4Cover.FORMAT_JPEG
        audio["covr"] = [MP4Cover(data, imageformat=mp4_format)]
        written.append("cover")
    return written


def _apply_flac(audio: FLAC, metadata: AudioMetadata) -> list[str]:
    written: list[str] = []
    if metadata.title:
        audio["title"] = metadata.title
        written.append("title")
    if metadata.artist:
        audio["artist"] = metadata.artist
        written.append("artist")
    if metadata.album:
        audio["album"] = metadata.album
        written.append("album")
    if metadata.genre:
        audio["genre"] = metadata.genre
        written.append("genre")
    if metadata.year:
        audio["date"] = metadata.year
        written.append("year")
    if metadata.comment:
        audio["comment"] = metadata.comment
        written.append("comment")
    if metadata.track_number:
        audio["tracknumber"] = metadata.track_number
        written.append("track_number")

    cover = _cover_bytes(metadata)
    if cover:
        data, mime = cover
        picture = Picture()
        picture.type = 3  # Cover (front)
        picture.mime = mime
        picture.desc = "Cover"
        picture.data = data
        audio.add_picture(picture)
        written.append("cover")
    return written


def _apply_vorbis(audio, metadata: AudioMetadata, format_name: str) -> list[str]:
    written: list[str] = []
    if metadata.title:
        audio["title"] = metadata.title
        written.append("title")
    if metadata.artist:
        audio["artist"] = metadata.artist
        written.append("artist")
    if metadata.album:
        audio["album"] = metadata.album
        written.append("album")
    if metadata.genre:
        audio["genre"] = metadata.genre
        written.append("genre")
    if metadata.year:
        audio["date"] = metadata.year
        written.append("year")
    if metadata.comment:
        audio["comment"] = metadata.comment
        written.append("comment")
    if metadata.track_number:
        audio["tracknumber"] = metadata.track_number
        written.append("track_number")

    cover = _cover_bytes(metadata)
    if cover:
        data, mime = cover
        picture_data = _vorbis_picture(data, mime)
        audio["metadata_block_picture"] = [picture_data]
        written.append("cover")
    return written


def _vorbis_picture(data: bytes, mime: str) -> str:
    """Build a base64-encoded Vorbis comment picture block.

    Layout: type(4) + mime_len(4) + mime + desc_len(4) + desc +
    width(4) + height(4) + depth(4) + colors(4) + data_len(4) + data
    """
    import base64

    picture_type = (3).to_bytes(4, "big")  # Cover (front)
    mime_bytes = mime.encode("utf-8")
    desc_bytes = b"Cover"
    width = (0).to_bytes(4, "big")
    height = (0).to_bytes(4, "big")
    depth = (0).to_bytes(4, "big")
    colors = (0).to_bytes(4, "big")
    data_len = len(data).to_bytes(4, "big")

    block = (
        picture_type
        + len(mime_bytes).to_bytes(4, "big")
        + mime_bytes
        + len(desc_bytes).to_bytes(4, "big")
        + desc_bytes
        + width
        + height
        + depth
        + colors
        + data_len
        + data
    )
    return base64.b64encode(block).decode("ascii")


def write_metadata(
    input_path: str | Path,
    output_path: str | Path | None = None,
    metadata: AudioMetadata | None = None,
) -> AudioMetadataResult:
    """Write metadata to an audio file.

    Args:
        input_path: Source audio file path.
        output_path: Destination path. If None, overwrites input_path.
        metadata: Metadata fields to write. If None, no changes are made.

    Returns:
        AudioMetadataResult with the output path and list of fields written.

    Raises:
        RuntimeError: If mutagen is not installed or the format is unsupported.
        FileNotFoundError: If input_path does not exist.
    """
    _require_mutagen()

    inp = Path(input_path)
    if not inp.exists():
        raise FileNotFoundError(f"Input audio file not found: {inp}")

    out = Path(output_path) if output_path else inp
    metadata = metadata or AudioMetadata()

    # Read existing file to preserve any data we're not overwriting
    audio = MutagenFile(str(inp))
    if audio is None:
        raise ValueError(f"Could not read audio file: {inp} (unsupported or corrupt)")

    fmt = inp.suffix.lower().lstrip(".")
    written: list[str] = []

    try:
        if fmt == "mp3":
            if not isinstance(audio, ID3):
                audio.add_tags()
            written = _apply_id3(audio, metadata)
        elif fmt in ("m4a", "m4b"):
            written = _apply_mp4(audio, metadata)
        elif fmt == "flac":
            written = _apply_flac(audio, metadata)
        elif fmt in ("ogg", "opus"):
            cls = OggVorbis if fmt == "ogg" else OggOpus
            audio = cls(str(inp))
            written = _apply_vorbis(audio, metadata, fmt)
        else:
            raise ValueError(
                f"Metadata writing not supported for format: {fmt} (supported: mp3, m4a, m4b, flac, ogg, opus)"
            )

        audio.save(str(out))
        return AudioMetadataResult(path=out, format=fmt, fields_written=written)
    except Exception:
        logger.exception("Failed to write metadata to %s", out)
        raise


def read_metadata(input_path: str | Path) -> AudioMetadata:
    """Read existing metadata from an audio file.

    Returns an AudioMetadata with whatever fields are present (unset fields
    are None).
    """
    _require_mutagen()

    inp = Path(input_path)
    if not inp.exists():
        raise FileNotFoundError(f"Input audio file not found: {inp}")

    audio = MutagenFile(str(inp))
    if audio is None:
        return AudioMetadata()

    fmt = inp.suffix.lower().lstrip(".")
    metadata = AudioMetadata()

    try:
        if fmt == "mp3":
            if "TIT2" in audio:
                metadata.title = str(audio["TIT2"])
            if "TPE1" in audio:
                metadata.artist = str(audio["TPE1"])
            if "TALB" in audio:
                metadata.album = str(audio["TALB"])
            if "TCON" in audio:
                metadata.genre = str(audio["TCON"])
            if "TYER" in audio:
                metadata.year = str(audio["TYER"])
            if "COMM" in audio:
                metadata.comment = str(audio["COMM"])
            if "TRCK" in audio:
                metadata.track_number = str(audio["TRCK"])
            if "APIC" in audio:
                apic = audio["APIC"]
                metadata.cover_data = apic.data
                metadata.cover_mime = apic.mime
        elif fmt in ("m4a", "m4b"):
            if "\xa9nam" in audio:
                metadata.title = str(audio["\xa9nam"][0])
            if "\xa9ART" in audio:
                metadata.artist = str(audio["\xa9ART"][0])
            if "\xa9alb" in audio:
                metadata.album = str(audio["\xa9alb"][0])
            if "\xa9gen" in audio:
                metadata.genre = str(audio["\xa9gen"][0])
            if "\xa9day" in audio:
                metadata.year = str(audio["\xa9day"][0])
            if "\xa9cmt" in audio:
                metadata.comment = str(audio["\xa9cmt"][0])
            if "trkn" in audio:
                metadata.track_number = str(audio["trkn"][0][0])
            if "covr" in audio:
                cover = audio["covr"][0]
                metadata.cover_data = bytes(cover)
                metadata.cover_mime = "image/png" if cover.imageformat == MP4Cover.FORMAT_PNG else "image/jpeg"
        elif fmt == "flac":
            metadata.title = audio.get("title", [None])[0]
            metadata.artist = audio.get("artist", [None])[0]
            metadata.album = audio.get("album", [None])[0]
            metadata.genre = audio.get("genre", [None])[0]
            metadata.year = audio.get("date", [None])[0]
            metadata.comment = audio.get("comment", [None])[0]
            metadata.track_number = audio.get("tracknumber", [None])[0]
            if audio.pictures:
                metadata.cover_data = audio.pictures[0].data
                metadata.cover_mime = audio.pictures[0].mime
        elif fmt in ("ogg", "opus"):
            metadata.title = audio.get("title", [None])[0]
            metadata.artist = audio.get("artist", [None])[0]
            metadata.album = audio.get("album", [None])[0]
            metadata.genre = audio.get("genre", [None])[0]
            metadata.year = audio.get("date", [None])[0]
            metadata.comment = audio.get("comment", [None])[0]
            metadata.track_number = audio.get("tracknumber", [None])[0]
            if audio.get("metadata_block_picture"):
                import base64

                picture_data = base64.b64decode(audio["metadata_block_picture"][0])
                # Skip picture type (4) + mime_len (4)
                mime_len = int.from_bytes(picture_data[4:8], "big")
                metadata.cover_mime = picture_data[8 : 8 + mime_len].decode("utf-8", "replace")
                # Skip mime_len + mime + desc_len (4) + desc
                desc_len = int.from_bytes(picture_data[8 + mime_len : 12 + mime_len], "big")
                data_start = 12 + mime_len + desc_len
                # Skip width(4) + height(4) + depth(4) + colors(4) = 16
                data_len_start = data_start + 16
                data_len = int.from_bytes(picture_data[data_len_start : data_len_start + 4], "big")
                metadata.cover_data = picture_data[data_len_start + 4 : data_len_start + 4 + data_len]
    except Exception:
        logger.exception("Failed to read metadata from %s", inp)
        # Return whatever we managed to parse
    return metadata
