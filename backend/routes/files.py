"""File I/O endpoints — read, transcribe, compact, and validate files.

Implements the /files/* routes used by the assistant's file I/O tools
(read_file, read_pdf, read_epub, transcribe_file, compact_text,
list_supported_files, validate_file).
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config
from ..errors import ERR_AUDIO_NOT_FOUND

logger = logging.getLogger(__name__)

router = APIRouter()

# Supported file extensions
_TEXT_EXTS = {
    ".md",
    ".txt",
    ".rst",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".xml",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".py",
    ".rs",
}
_PDF_EXTS = {".pdf"}
_EPUB_EXTS = {".epub"}
_AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac", ".webm", ".opus"}
_ALL_SUPPORTED = _TEXT_EXTS | _PDF_EXTS | _EPUB_EXTS | _AUDIO_EXTS


def _resolve_path(path_str: str) -> Path:
    """Resolve a path relative to the data directory."""
    resolved = config.resolve_storage_path(path_str)
    if resolved is None:
        # Try as absolute path within data dir
        data_dir = config.get_data_dir()
        candidate = (data_dir / path_str).resolve()
        if candidate.is_relative_to(data_dir.resolve()) and candidate.exists():
            return candidate
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path_str}")
    return resolved


def _compact_text(text: str, max_tokens: int | None = None, preserve_start_end: bool = True) -> tuple[str, bool]:
    """Compact text by removing excess whitespace and optionally truncating."""
    import re

    # Normalize whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = text.strip()

    truncated = False
    if max_tokens and max_tokens > 0:
        # Rough estimate: 1 token ≈ 4 characters
        max_chars = max_tokens * 4
        if len(text) > max_chars:
            truncated = True
            if preserve_start_end:
                half = max_chars // 2
                text = text[:half] + "\n\n[... truncated ...]\n\n" + text[-half:]
            else:
                text = text[:max_chars]
    return text, truncated


# ── Read text files ────────────────────────────────────────────────────────


class ReadFileRequest(BaseModel):
    path: str
    max_tokens: int | None = None
    compact: bool = True


@router.post("/files/read")
def read_file(req: ReadFileRequest) -> dict:
    """Read a text file and return its contents."""
    file_path = _resolve_path(req.path)
    ext = file_path.suffix.lower()
    if ext not in _TEXT_EXTS:
        raise HTTPException(
            status_code=400, detail=f"Unsupported file type: {ext}. Supported: {', '.join(sorted(_TEXT_EXTS))}"
        )
    try:
        text = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = file_path.read_text(encoding="latin-1")
    truncated = False
    if req.compact:
        text, truncated = _compact_text(text, req.max_tokens)
    return {
        "content": text,
        "path": str(file_path.name),
        "truncated": truncated,
        "size_bytes": file_path.stat().st_size,
    }


# ── Read PDF ───────────────────────────────────────────────────────────────


class ReadPdfRequest(BaseModel):
    path: str
    max_pages: int = 50
    compact: bool = True


@router.post("/files/read-pdf")
def read_pdf(req: ReadPdfRequest) -> dict:
    """Extract text from a PDF document."""
    file_path = _resolve_path(req.path)
    ext = file_path.suffix.lower()
    if ext not in _PDF_EXTS:
        raise HTTPException(status_code=400, detail=f"Not a PDF file: {ext}")
    try:
        import fitz  # PyMuPDF
    except ImportError as err:
        raise HTTPException(status_code=501, detail="PyMuPDF not installed — pip install PyMuPDF") from err
    doc = fitz.open(str(file_path))
    pages = []
    for i, page in enumerate(doc):
        if i >= req.max_pages:
            break
        pages.append(page.get_text())
    doc.close()
    text = "\n\n".join(pages)
    truncated = False
    if req.compact:
        text, truncated = _compact_text(text)
    return {
        "content": text,
        "path": str(file_path.name),
        "pages_extracted": min(len(pages), req.max_pages),
        "truncated": truncated,
    }


# ── Read EPUB ──────────────────────────────────────────────────────────────


class ReadEpubRequest(BaseModel):
    path: str
    compact: bool = True


@router.post("/files/read-epub")
def read_epub(req: ReadEpubRequest) -> dict:
    """Extract text from an EPUB ebook."""
    file_path = _resolve_path(req.path)
    ext = file_path.suffix.lower()
    if ext not in _EPUB_EXTS:
        raise HTTPException(status_code=400, detail=f"Not an EPUB file: {ext}")
    try:
        import fitz  # PyMuPDF handles EPUB too
    except ImportError as err:
        raise HTTPException(status_code=501, detail="PyMuPDF not installed — pip install PyMuPDF") from err
    doc = fitz.open(str(file_path))
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    text = "\n\n".join(pages)
    truncated = False
    if req.compact:
        text, truncated = _compact_text(text)
    return {"content": text, "path": str(file_path.name), "truncated": truncated}


# ── Transcribe audio file ──────────────────────────────────────────────────


class TranscribeFileRequest(BaseModel):
    audio_path: str
    language: str | None = None
    model: str = "base"
    include_timestamps: bool = True
    compact: bool = True


@router.post("/files/transcribe")
def transcribe_file(req: TranscribeFileRequest) -> dict:
    """Transcribe an audio file using Whisper STT."""
    file_path = _resolve_path(req.audio_path)
    ext = file_path.suffix.lower()
    if ext not in _AUDIO_EXTS:
        raise HTTPException(
            status_code=400, detail=f"Not an audio file: {ext}. Supported: {', '.join(sorted(_AUDIO_EXTS))}"
        )
    # Delegate to the existing /transcribe/path endpoint to avoid
    # duplicating model loading, caching, and cloud-fallback logic.
    import httpx

    from .. import config as _cfg

    base_url = _cfg.get_server_base_url()
    payload = {
        "audio_path": req.audio_path,
        "language": req.language,
        "model": req.model,
    }
    try:
        resp = httpx.post(f"{base_url}/transcribe/path", json=payload, timeout=300)
        resp.raise_for_status()
        data = resp.json()
        text = data.get("text", "")
        truncated = False
        if req.compact:
            text, truncated = _compact_text(text)
        return {
            "content": text,
            "segments": data.get("segments", []) if req.include_timestamps else [],
            "path": str(file_path.name),
            "truncated": truncated,
        }
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=f"Transcription failed: {e.response.text[:200]}"
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}") from e


# ── Compact text ───────────────────────────────────────────────────────────


class CompactTextRequest(BaseModel):
    text: str
    max_tokens: int | None = None
    preserve_start_end: bool = True


@router.post("/files/compact")
def compact_text(req: CompactTextRequest) -> dict:
    """Compact and clean text content."""
    text, truncated = _compact_text(req.text, req.max_tokens, req.preserve_start_end)
    return {"content": text, "truncated": truncated, "original_length": len(req.text), "compacted_length": len(text)}


# ── List supported files ───────────────────────────────────────────────────


class ListSupportedFilesRequest(BaseModel):
    directory: str
    recursive: bool = False


@router.post("/files/list-supported")
def list_supported_files(req: ListSupportedFilesRequest) -> dict:
    """List supported files in a directory."""
    dir_path = _resolve_path(req.directory)
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {req.directory}")
    files = []
    pattern = "**/*" if req.recursive else "*"
    for p in dir_path.glob(pattern):
        if p.is_file() and p.suffix.lower() in _ALL_SUPPORTED:
            files.append(
                {
                    "path": str(p.relative_to(dir_path)),
                    "extension": p.suffix.lower(),
                    "size_bytes": p.stat().st_size,
                    "readable": True,
                }
            )
    return {"files": sorted(files, key=lambda f: f["path"]), "directory": str(dir_path), "count": len(files)}


# ── Validate file ──────────────────────────────────────────────────────────


class ValidateFileRequest(BaseModel):
    path: str


@router.post("/files/validate")
def validate_file(req: ValidateFileRequest) -> dict:
    """Validate a file path: check existence, type, and size."""
    try:
        file_path = _resolve_path(req.path)
    except HTTPException:
        return {"valid": False, "error": "File not found", "path": req.path}
    ext = file_path.suffix.lower()
    size = file_path.stat().st_size
    supported = ext in _ALL_SUPPORTED
    file_type = (
        "text"
        if ext in _TEXT_EXTS
        else "pdf"
        if ext in _PDF_EXTS
        else "epub"
        if ext in _EPUB_EXTS
        else "audio"
        if ext in _AUDIO_EXTS
        else "unknown"
    )
    return {
        "valid": supported,
        "path": req.path,
        "exists": True,
        "extension": ext,
        "file_type": file_type,
        "size_bytes": size,
        "readable": supported,
    }
