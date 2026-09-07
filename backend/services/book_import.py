"""EPUB/PDF book import via PyMuPDF (offline, Chapter segmentation)."""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

CHAPTER_RE = re.compile(r"^(chapter|chapitre|kapitel|capitulo|capítulo)\s+\d+", re.I)
HEADING_RE = re.compile(r"^\s*(chapter|prologue|epilogue|part|appendix)\b", re.I)

MIN_CHAPTER_CHARS = 300
MAX_CHAPTER_CHARS = 50000


def _clean_text(t: str) -> str:
    t = t.replace("\r", "\n")
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


def _split_by_headings(text: str) -> list[dict]:
    """Split raw text along chapter headings."""
    lines = text.split("\n")
    chapters: list[dict] = []
    cur_title: str | None = None
    cur_buf: list[str] = []

    def flush():
        nonlocal cur_title, cur_buf
        body = _clean_text("\n".join(cur_buf))
        if not body or len(body) < MIN_CHAPTER_CHARS:
            if body and chapters:
                chapters[-1]["text"] += "\n\n" + body
            elif body:
                cur_buf = [body]
                return
            else:
                cur_buf = []
                cur_title = None
                return
        title = cur_title or f"Chapter {len(chapters) + 1}"
        chapters.append({"title": title.strip()[:120], "text": body, "word_count": len(body.split())})
        cur_buf = []
        cur_title = None

    for line in lines:
        stripped = line.strip()
        # Heading detection: standalone line matching chapter pattern or ALL-CAPS short heading
        is_heading = False
        if (
            stripped
            and len(stripped) < 120
            and (
                CHAPTER_RE.match(stripped)
                or HEADING_RE.match(stripped)
                or (stripped.isupper() and 3 <= len(stripped.split()) <= 6)
            )
        ):
            is_heading = True
        if is_heading and cur_buf:
            flush()
            cur_title = stripped
        elif is_heading and not cur_buf:
            cur_title = stripped
        else:
            cur_buf.append(line)

    if cur_buf:
        flush()
    if not chapters:
        body = _clean_text(text)
        chapters.append({"title": "Chapter 1", "text": body, "word_count": len(body.split())})
    return chapters


def _parse_with_pymupdf(path: Path) -> tuple[str, list[dict], str | None]:
    """Open via PyMuPDF (handles PDF + EPUB). Returns (title, chapters, toc_text)."""
    try:
        import fitz  # pymupdf
    except ImportError as e:
        raise RuntimeError("PyMuPDF not installed — run: pip install PyMuPDF") from e

    with fitz.open(str(path)) as doc:
        meta_title = (doc.metadata.get("title") or "").strip() or path.stem
        # Try TOC first
        toc = doc.get_toc(simple=True)  # list of [level, title, page]
        full_text_parts: list[str] = []
        for page in doc:
            full_text_parts.append(page.get_text("text"))
        full_text = _clean_text("\n".join(full_text_parts))

    if toc and len(toc) >= 2:
        # Build chapters from TOC boundaries when available — but we still use text splitting
        chapters = _split_by_headings(full_text)
        return meta_title, chapters, None

    chapters = _split_by_headings(full_text)
    return meta_title, chapters, None


def parse_book(path: str | Path) -> dict:
    """Parse EPUB or PDF at `path` → {title, chapters, cover_extracted}."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(str(p))
    suffix = p.suffix.lower()
    if suffix not in (".pdf", ".epub"):
        raise ValueError(f"Unsupported book format: {suffix} (expected .pdf or .epub)")

    title, chapters, _ = _parse_with_pymupdf(p)

    # Extract embedded cover via PyMuPDF if present (first image on first page that's large)
    cover_bytes = None
    cover_ext = None
    try:
        import fitz

        doc = fitz.open(str(p))
        if len(doc) > 0:
            pix = None
            for img in doc[0].get_images(full=True):
                xref = img[0]
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.w >= 300 and pix.h >= 300:
                        cover_bytes = pix.tobytes("png")
                        cover_ext = "png"
                        break
                except Exception:
                    logger.debug("Cover extraction failed for xref %s", xref, exc_info=True)
                    continue
        doc.close()
    except ImportError:
        pass
    except Exception:
        logger.debug("PyMuPDF import/parsing failed", exc_info=True)

    return {"title": title, "chapters": chapters, "cover_bytes": cover_bytes, "cover_ext": cover_ext}


def save_cover(audiobook_id: str, cover_bytes: bytes, ext: str = "png") -> str:
    """Persist cover to data/audiobooks/<id>/cover.<ext>, return storage-relative path."""
    from ..config import get_data_dir, to_storage_path

    data_dir = get_data_dir()
    out_dir = data_dir / "audiobooks" / audiobook_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"cover.{ext}"
    out_path.write_bytes(cover_bytes)
    return to_storage_path(out_path)


def persist_uploaded_cover(audiobook_id: str, filename: str, data: bytes) -> str:
    """Save user-uploaded cover (validate extension)."""
    ext = Path(filename).suffix.lower().lstrip(".") or "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        ext = "png"
    return save_cover(audiobook_id, data, ext)
