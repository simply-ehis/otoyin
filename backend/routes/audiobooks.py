"""Audiobooks REST API — import, cast, render, export, convert."""

from __future__ import annotations

import asyncio
import io
import logging
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .. import config
from ..database import Audiobook as DBAudiobook, AudiobookChapter as DBChapter, AudiobookVoiceCast as DBCast, get_db
from ..errors import (
    ERR_AUDIO_NOT_FOUND,
    ERR_COVER_TOO_LARGE,
    ERR_EMPTY_CHAPTERS,
    ERR_EMPTY_RENDERED,
    ERR_EMPTY_UTTERANCES,
    ERR_ENGINE_NOT_DOWNLOADED,
    ERR_ENTITY_NOT_FOUND,
    ERR_FFMPEG_MISSING,
    ERR_FORMAT_UNSUPPORTED_EPUB,
    ERR_PROFILE_ENGINE_MISSING,
    ERR_PROJECT_NOT_FOUND,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic ────────────────────────────────────────────────────────────


class AudiobookCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    author: str | None = None
    description: str | None = None


class AudiobookResponse(BaseModel):
    id: str
    title: str
    author: str | None
    description: str | None
    cover_path: str | None
    source_type: str | None
    total_duration_ms: int | None
    created_at: str
    updated_at: str
    chapter_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ChapterResponse(BaseModel):
    id: str
    audiobook_id: str
    order_index: int
    title: str
    text: str
    word_count: int | None
    status: str
    audio_path: str | None
    duration_ms: int | None
    error: str | None
    generation_id: str | None

    model_config = ConfigDict(from_attributes=True)


class UtteranceResponse(BaseModel):
    id: str
    chapter_id: str
    audiobook_id: str
    order_index: int
    character: str
    text: str
    profile_id: str | None
    engine: str | None
    audio_path: str | None
    duration_ms: int | None
    status: str
    error: str | None

    model_config = ConfigDict(from_attributes=True)


class AudiobookDetailResponse(AudiobookResponse):
    chapters: list[ChapterResponse] = []
    cast: list[dict] = []
    utterances: list[UtteranceResponse] = []


class CastUpsert(BaseModel):
    character: str = Field(..., min_length=1, max_length=80)
    profile_id: str | None = None
    engine: str | None = None


class RenderRequest(BaseModel):
    profile_id: str | None = None
    engine: str | None = None


class ConvertRequest(BaseModel):
    audio_path: str
    format: str = Field(..., pattern="^(wav|mp3|m4a|m4b|flac|ogg|opus)$")
    bitrate: str = "128k"
    sample_rate: int | None = None


class SuggestCastRequest(BaseModel):
    sample_chars: int = 6000


# ── helpers ─────────────────────────────────────────────────────────────


def _book_to_resp(book: DBAudiobook, db: Session) -> AudiobookResponse:
    count = db.query(DBChapter).filter_by(audiobook_id=book.id).count()
    return AudiobookResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        description=book.description,
        cover_path=book.cover_path,
        source_type=book.source_type,
        total_duration_ms=book.total_duration_ms,
        created_at=book.created_at.isoformat() if book.created_at else "",
        updated_at=book.updated_at.isoformat() if book.updated_at else "",
        chapter_count=count,
    )


# ── CRUD ────────────────────────────────────────────────────────────────


@router.get("/audiobooks", response_model=list[AudiobookResponse])
async def list_audiobooks(db: Session = Depends(get_db)):
    books = db.query(DBAudiobook).order_by(DBAudiobook.updated_at.desc()).all()
    return [_book_to_resp(b, db) for b in books]


@router.post("/audiobooks", response_model=AudiobookResponse)
async def create_audiobook(data: AudiobookCreate, db: Session = Depends(get_db)):
    book = DBAudiobook(
        id=str(uuid.uuid4()), title=data.title, author=data.author, description=data.description, source_type="empty"
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return _book_to_resp(book, db)


@router.get("/audiobooks/{book_id}", response_model=AudiobookDetailResponse)
async def get_audiobook(book_id: str, db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    chapters = db.query(DBChapter).filter_by(audiobook_id=book_id).order_by(DBChapter.order_index).all()
    cast_rows = db.query(DBCast).filter_by(audiobook_id=book_id).all()
    from ..database import AudiobookUtterance as DBUtt

    utterances = db.query(DBUtt).filter_by(audiobook_id=book_id).order_by(DBUtt.chapter_id, DBUtt.order_index).all()
    resp = _book_to_resp(book, db)
    detail = AudiobookDetailResponse(
        **resp.model_dump(),
        chapters=[ChapterResponse.model_validate(c) for c in chapters],
        cast=[{"character": c.character, "profile_id": c.profile_id, "engine": c.engine} for c in cast_rows],
        utterances=[UtteranceResponse.model_validate(u) for u in utterances],
    )
    return detail


@router.delete("/audiobooks/{book_id}")
async def delete_audiobook(book_id: str, db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    import contextlib

    from ..database import AudiobookUtterance as DBUtt

    # Delete audio files for chapters + utterances + cover before removing rows
    for ch in db.query(DBChapter).filter_by(audiobook_id=book_id).all():
        if ch.audio_path:
            p = config.resolve_storage_path(ch.audio_path)
            if p and p.exists():
                with contextlib.suppress(Exception):
                    p.unlink()
    for utt in db.query(DBUtt).filter_by(audiobook_id=book_id).all():
        if utt.audio_path:
            p = config.resolve_storage_path(utt.audio_path)
            if p and p.exists():
                with contextlib.suppress(Exception):
                    p.unlink()
    if book.cover_path:
        p = config.resolve_storage_path(book.cover_path)
        if p and p.exists():
            with contextlib.suppress(Exception):
                p.unlink()

    db.query(DBUtt).filter_by(audiobook_id=book_id).delete()
    db.query(DBChapter).filter_by(audiobook_id=book_id).delete()
    db.query(DBCast).filter_by(audiobook_id=book_id).delete()
    db.delete(book)
    db.commit()
    return {"message": "Audiobook deleted"}


# ── Import ──────────────────────────────────────────────────────────────


@router.post("/audiobooks/preview")
async def preview_book(
    file: UploadFile = File(...),
):
    """Parse EPUB/PDF and return chapter list without saving to DB."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".pdf", ".epub"):
        raise HTTPException(status_code=400, detail=ERR_FORMAT_UNSUPPORTED_EPUB)
    content = await file.read()
    if len(content) > config.IMPORT_AUDIO_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {config.IMPORT_AUDIO_MAX_BYTES // (1024 * 1024)} MB)",
        )
    tmp = Path(tempfile.mktemp(suffix=suffix))
    tmp.write_bytes(content)
    try:
        from ..utils.async_audio import async_parse_book

        try:
            parsed = await async_parse_book(tmp)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        chapters = parsed.get("chapters") or []
        return {
            "title": parsed.get("title", tmp.stem),
            "has_cover": parsed.get("cover_bytes") is not None,
            "chapters": [
                {
                    "index": idx,
                    "title": ch.get("title") or f"Chapter {idx + 1}",
                    "word_count": ch.get("word_count", 0),
                    "preview": (ch.get("text") or "")[:200],
                }
                for idx, ch in enumerate(chapters)
            ],
        }
    finally:
        tmp.unlink(missing_ok=True)


@router.post("/audiobooks/import", response_model=AudiobookDetailResponse)
async def import_book(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    author: str | None = Form(None),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".pdf", ".epub"):
        raise HTTPException(status_code=400, detail=ERR_FORMAT_UNSUPPORTED_EPUB)
    content = await file.read()
    if len(content) > config.IMPORT_AUDIO_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {config.IMPORT_AUDIO_MAX_BYTES // (1024 * 1024)} MB)",
        )
    tmp = Path(tempfile.mktemp(suffix=suffix))
    tmp.write_bytes(content)
    try:
        from ..services.book_import import save_cover
        from ..utils.async_audio import async_parse_book

        try:
            parsed = await async_parse_book(tmp)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        book_title = title or parsed["title"]
        book = DBAudiobook(
            id=str(uuid.uuid4()),
            title=book_title,
            author=author,
            source_type=suffix.lstrip("."),
            description=f"Imported from {file.filename}",
        )
        db.add(book)
        db.flush()
        # cover
        if parsed.get("cover_bytes"):
            try:
                cpath = save_cover(book.id, parsed["cover_bytes"], parsed.get("cover_ext") or "png")
                book.cover_path = cpath
            except Exception:
                logger.debug("Cover save failed for import (non-critical)", exc_info=True)
        # chapters
        chapters = parsed.get("chapters") or []
        for idx, ch in enumerate(chapters):
            db.add(
                DBChapter(
                    id=str(uuid.uuid4()),
                    audiobook_id=book.id,
                    order_index=idx,
                    title=ch.get("title") or f"Chapter {idx + 1}",
                    text=ch.get("text") or "",
                    word_count=ch.get("word_count"),
                    status="draft",
                )
            )
        db.commit()
        db.refresh(book)
        return await get_audiobook(book.id, db)
    finally:
        tmp.unlink(missing_ok=True)


class ImportPathRequest(BaseModel):
    file_path: str
    title: str | None = None
    author: str | None = None


@router.post("/audiobooks/import-path", response_model=AudiobookDetailResponse)
async def import_book_from_path(data: ImportPathRequest, db: Session = Depends(get_db)):
    """Import an audiobook from a local file path (for assistant/MCP tools)."""
    from ..config import resolve_storage_path

    resolved = resolve_storage_path(data.file_path)
    if resolved is None:
        raise HTTPException(status_code=403, detail="Access denied: path outside allowed directory")
    path = resolved
    if not path.exists():
        raise HTTPException(status_code=400, detail=ERR_AUDIO_NOT_FOUND)
    suffix = path.suffix.lower()
    if suffix not in (".pdf", ".epub"):
        raise HTTPException(status_code=400, detail=ERR_FORMAT_UNSUPPORTED_EPUB)
    try:
        from ..services.book_import import save_cover
        from ..utils.async_audio import async_parse_book

        try:
            parsed = await async_parse_book(path)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        book_title = data.title or parsed["title"]
        book = DBAudiobook(
            id=str(uuid.uuid4()),
            title=book_title,
            author=data.author,
            source_type=suffix.lstrip("."),
            description=f"Imported from {path.name}",
        )
        db.add(book)
        db.flush()
        if parsed.get("cover_bytes"):
            try:
                cpath = save_cover(book.id, parsed["cover_bytes"], parsed.get("cover_ext") or "png")
                book.cover_path = cpath
            except Exception:
                logger.debug("Cover save failed for import-path (non-critical)", exc_info=True)
        for idx, ch in enumerate(parsed.get("chapters", [])):
            db.add(
                DBChapter(
                    audiobook_id=book.id,
                    order_index=idx,
                    title=ch.get("title") or f"Chapter {idx + 1}",
                    text=ch.get("text") or "",
                    word_count=ch.get("word_count"),
                    status="draft",
                )
            )
        db.commit()
        db.refresh(book)
        return await get_audiobook(book.id, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Audiobook import from path failed")
        raise HTTPException(status_code=500, detail="Audiobook import failed") from e


@router.post("/audiobooks/{book_id}/chapters", response_model=ChapterResponse)
async def add_chapter(book_id: str, title: str = Form(...), text: str = Form(...), db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    max_order = db.query(DBChapter).filter_by(audiobook_id=book_id).count()
    ch = DBChapter(
        id=str(uuid.uuid4()),
        audiobook_id=book_id,
        order_index=max_order,
        title=title,
        text=text,
        word_count=len(text.split()),
        status="draft",
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return ChapterResponse.model_validate(ch)


@router.put("/audiobooks/{book_id}/chapters/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    book_id: str, chapter_id: str, title: str = Form(...), text: str = Form(...), db: Session = Depends(get_db)
):
    ch = db.query(DBChapter).filter_by(id=chapter_id, audiobook_id=book_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail=ERR_ENTITY_NOT_FOUND)
    ch.title = title
    ch.text = text
    ch.word_count = len(text.split())
    db.commit()
    db.refresh(ch)
    return ChapterResponse.model_validate(ch)


@router.delete("/audiobooks/{book_id}/chapters/{chapter_id}")
async def delete_chapter(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    ch = db.query(DBChapter).filter_by(id=chapter_id, audiobook_id=book_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail=ERR_ENTITY_NOT_FOUND)
    db.delete(ch)
    db.commit()
    return {"message": "Chapter deleted"}


# ── Cover upload ────────────────────────────────────────────────────────


@router.post("/audiobooks/{book_id}/cover")
async def upload_cover(book_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    max_bytes = config.IMAGE_MAX_FILE_SIZE
    data = bytearray()
    while chunk := await file.read(65536):
        data.extend(chunk)
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Cover too large (max {max_bytes // (1024 * 1024)} MB)",
            )
    from ..services.book_import import persist_uploaded_cover

    cpath = persist_uploaded_cover(book_id, file.filename or "cover.png", bytes(data))
    book.cover_path = cpath
    db.commit()
    return {"cover_path": cpath}


# ── Voice cast ──────────────────────────────────────────────────────────


@router.get("/audiobooks/{book_id}/cast")
async def list_cast(book_id: str, db: Session = Depends(get_db)):
    rows = db.query(DBCast).filter_by(audiobook_id=book_id).all()
    return {"cast": [{"character": r.character, "profile_id": r.profile_id, "engine": r.engine} for r in rows]}


@router.put("/audiobooks/{book_id}/cast")
async def upsert_cast(book_id: str, data: CastUpsert, db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    row = db.query(DBCast).filter_by(audiobook_id=book_id, character=data.character).first()
    if row:
        row.profile_id = data.profile_id
        row.engine = data.engine
    else:
        row = DBCast(
            id=str(uuid.uuid4()),
            audiobook_id=book_id,
            character=data.character,
            profile_id=data.profile_id,
            engine=data.engine,
        )
        db.add(row)
    db.commit()
    return {"character": row.character, "profile_id": row.profile_id, "engine": row.engine}


@router.delete("/audiobooks/{book_id}/cast/{character}")
async def delete_cast(book_id: str, character: str, db: Session = Depends(get_db)):
    row = db.query(DBCast).filter_by(audiobook_id=book_id, character=character).first()
    if not row:
        raise HTTPException(status_code=404, detail=ERR_ENTITY_NOT_FOUND)
    db.delete(row)
    db.commit()
    return {"message": "Cast removed"}


@router.post("/audiobooks/{book_id}/cast/suggest")
async def suggest_cast(book_id: str, body: SuggestCastRequest | None = None, db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    chapters = db.query(DBChapter).filter_by(audiobook_id=book_id).order_by(DBChapter.order_index).all()
    if not chapters:
        raise HTTPException(status_code=400, detail=ERR_EMPTY_CHAPTERS)
    from ..services.audiobook_llm import llm_extract_characters

    chars = await llm_extract_characters(
        [{"title": c.title, "text": c.text} for c in chapters], sample_chars=(body.sample_chars if body else 6000)
    )
    # Enrich with current cast + profile suggestions
    from ..database import VoiceProfile as DBProfile

    profiles = db.query(DBProfile).all()
    prof_list = [{"id": p.id, "name": p.name, "preset_voice_id": p.preset_voice_id} for p in profiles]
    from ..services.audiobook_llm import suggest_voice_for_character

    for ch in chars:
        # existing mapping
        existing = db.query(DBCast).filter_by(audiobook_id=book_id, character=ch["character"]).first()
        if existing and existing.profile_id:
            ch["profile_id"] = existing.profile_id
        else:
            suggested = suggest_voice_for_character(ch, prof_list)
            ch["suggested_profile_id"] = suggested["id"] if suggested else None
            ch["suggested_profile_name"] = suggested["name"] if suggested else None
    return {"characters": chars, "profiles": prof_list}


# ── Script parse: split chapter into utterances by ^Name: ────────────


@router.post("/audiobooks/{book_id}/chapters/{chapter_id}/parse-script", response_model=list[UtteranceResponse])
async def parse_chapter_script(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    from ..database import AudiobookUtterance as DBUtt
    from ..services.script_parser import parse_script

    ch = db.query(DBChapter).filter_by(id=chapter_id, audiobook_id=book_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail=ERR_ENTITY_NOT_FOUND)
    # Clear previous utterances for this chapter
    db.query(DBUtt).filter_by(chapter_id=chapter_id).delete()

    parsed = parse_script(ch.text or "")
    if not parsed:
        raise HTTPException(status_code=400, detail=ERR_EMPTY_UTTERANCES)

    seen_cast: set[str] = set()
    existing_cast_chars = {c.character for c in db.query(DBCast).filter_by(audiobook_id=book_id).all()}
    utterances = []
    for idx, utt in enumerate(parsed):
        row = DBUtt(
            id=str(uuid.uuid4()),
            chapter_id=chapter_id,
            audiobook_id=book_id,
            order_index=idx,
            character=utt["character"],
            text=utt["text"],
            status="draft",
        )
        cast = db.query(DBCast).filter_by(audiobook_id=book_id, character=utt["character"]).first()
        if cast:
            row.profile_id = cast.profile_id
            row.engine = cast.engine
        db.add(row)
        utterances.append(row)
        # auto-create cast entry if missing (dedupe within this batch)
        if utt["character"] not in existing_cast_chars and utt["character"] not in seen_cast:
            db.add(DBCast(id=str(uuid.uuid4()), audiobook_id=book_id, character=utt["character"]))
            seen_cast.add(utt["character"])

    db.commit()
    for u in utterances:
        db.refresh(u)
    return [UtteranceResponse.model_validate(u) for u in utterances]


@router.get("/audiobooks/{book_id}/chapters/{chapter_id}/utterances", response_model=list[UtteranceResponse])
async def list_utterances(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    from ..database import AudiobookUtterance as DBUtt

    rows = db.query(DBUtt).filter_by(audiobook_id=book_id, chapter_id=chapter_id).order_by(DBUtt.order_index).all()
    return [UtteranceResponse.model_validate(r) for r in rows]


@router.get("/audiobooks/{book_id}/utterances", response_model=list[UtteranceResponse])
async def list_all_utterances(book_id: str, db: Session = Depends(get_db)):
    from ..database import AudiobookUtterance as DBUtt

    rows = db.query(DBUtt).filter_by(audiobook_id=book_id).order_by(DBUtt.chapter_id, DBUtt.order_index).all()
    return [UtteranceResponse.model_validate(r) for r in rows]


@router.delete("/audiobooks/{book_id}/chapters/{chapter_id}/utterances")
async def clear_utterances(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    from ..database import AudiobookUtterance as DBUtt

    db.query(DBUtt).filter_by(audiobook_id=book_id, chapter_id=chapter_id).delete()
    db.commit()
    return {"message": "Utterances cleared"}


@router.get("/audiobooks/cached-engines")
async def list_cached_engines():
    """List only TTS engines that are downloaded/cached — no download, no default forcing."""
    from ..backends import get_all_model_configs
    from ..services.model_registry import is_downloaded

    cached = []
    for cfg in get_all_model_configs():
        if cfg.category != "tts":
            continue
        try:
            if is_downloaded(cfg.model_name, cfg.model_size):
                cached.append(
                    {
                        "engine": cfg.engine,
                        "model_name": cfg.model_name,
                        "display_name": cfg.display_name,
                        "model_size": cfg.model_size,
                    }
                )
        except Exception:
            logger.debug("Engine config check failed for %s (skipping)", cfg.engine, exc_info=True)
            continue
    # dedupe by engine
    seen = {}
    for c in cached:
        if c["engine"] not in seen:
            seen[c["engine"]] = c
    return {"engines": list(seen.values())}


# ── Render ──────────────────────────────────────────────────────────────


@router.post("/audiobooks/{book_id}/render")
async def render_book(book_id: str, data: RenderRequest, db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    # Enforce cached engine — never auto-download, never force default
    if data.engine:
        from ..backends import get_all_model_configs
        from ..services.model_registry import is_downloaded

        matches = [c for c in get_all_model_configs() if c.engine == data.engine]
        if not matches:
            raise HTTPException(status_code=400, detail=f"That engine isn't in the catalog: {data.engine}")
        # At least one variant must be downloaded
        if not any(is_downloaded(c.model_name, c.model_size) for c in matches):
            raise HTTPException(status_code=400, detail=ERR_ENGINE_NOT_DOWNLOADED)
    elif data.profile_id:
        # If engine not specified but profile implies one, validate that implied engine is cached
        from ..database import VoiceProfile as DBProfile

        prof = db.query(DBProfile).filter_by(id=data.profile_id).first()
        implied = getattr(prof, "preset_engine", None) or getattr(prof, "default_engine", None)
        if implied:
            from ..backends import get_all_model_configs
            from ..services.model_registry import is_downloaded

            matches = [c for c in get_all_model_configs() if c.engine == implied]
            if matches and not any(is_downloaded(c.model_name, c.model_size) for c in matches):
                raise HTTPException(status_code=400, detail=ERR_PROFILE_ENGINE_MISSING)
    from ..services.batch import add_job_from_scripting

    job = add_job_from_scripting(
        name=f"audiobook:{book.title}",
        func_name="audiobook_render",
        func_args={"audiobook_id": book_id, "profile_id": data.profile_id, "engine": data.engine},
    )
    return {"job_id": job.id, "status": job.status.value}


# ── Export (WAV default, concat) ───────────────────────────────────────


@router.get("/audiobooks/{book_id}/export")
async def export_audiobook(book_id: str, db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    chapters = db.query(DBChapter).filter_by(audiobook_id=book_id).order_by(DBChapter.order_index).all()
    # Collect WAV paths
    wav_paths: list[Path] = []
    for ch in chapters:
        if ch.audio_path:
            p = config.resolve_storage_path(ch.audio_path)
            if p and p.exists():
                wav_paths.append(p)
    if not wav_paths:
        raise HTTPException(status_code=400, detail=ERR_EMPTY_RENDERED)
    # Concat via ffmpeg if multiple, else direct
    if len(wav_paths) == 1:
        data = wav_paths[0].read_bytes()
        return StreamingResponse(
            io.BytesIO(data),
            media_type="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="{book.title}.wav"'},
        )
    # ffmpeg concat
    import subprocess
    import tempfile

    from ..services.audio_conversion import ffmpeg_available

    if not ffmpeg_available():
        raise HTTPException(status_code=500, detail=ERR_FFMPEG_MISSING)
    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "list.txt"
        lst.write_text("\n".join(f"file '{p.resolve()}'" for p in wav_paths))
        out = Path(td) / "out.wav"
        await asyncio.to_thread(
            subprocess.run,
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out)],
            capture_output=True,
            check=False,
        )
        if not out.exists():
            await asyncio.to_thread(
                subprocess.run,
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), str(out)],
                capture_output=True,
                check=True,
            )
        data = out.read_bytes()
        return StreamingResponse(
            io.BytesIO(data),
            media_type="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="{book.title}.wav"'},
        )


@router.get("/audiobooks/{book_id}/export-m4b")
async def export_m4b(book_id: str, bitrate: str = "64k", db: Session = Depends(get_db)):
    book = db.query(DBAudiobook).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    chapters = db.query(DBChapter).filter_by(audiobook_id=book_id).order_by(DBChapter.order_index).all()
    wav_paths: list[Path] = []
    titles: list[str] = []
    for ch in chapters:
        if ch.audio_path:
            p = config.resolve_storage_path(ch.audio_path)
            if p and p.exists():
                wav_paths.append(p)
                titles.append(ch.title)
    if not wav_paths:
        raise HTTPException(status_code=400, detail=ERR_EMPTY_RENDERED)
    from ..utils.async_audio import async_build_m4b

    cover_path = config.resolve_storage_path(book.cover_path) if book.cover_path else None
    out = Path(tempfile.mktemp(suffix=".m4b"))
    try:
        await async_build_m4b(wav_paths, titles, out, cover_path=cover_path, author=book.author, title=book.title, bitrate=bitrate)
        data = out.read_bytes()
        return StreamingResponse(
            io.BytesIO(data),
            media_type="audio/mp4",
            headers={"Content-Disposition": f'attachment; filename="{book.title}.m4b"'},
        )
    finally:
        out.unlink(missing_ok=True)


# ── Generic conversion ──────────────────────────────────────────────────


@router.post("/audiobooks/convert")
async def convert_audio_endpoint(data: ConvertRequest):
    from ..services.audio_conversion import SUPPORTED_FORMATS, ffmpeg_available
    from ..utils.async_audio import async_convert_audio_file

    if not ffmpeg_available():
        raise HTTPException(status_code=500, detail="ffmpeg not available")
    if data.format not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {data.format}")
    resolved = config.resolve_storage_path(data.audio_path)
    if not resolved or not resolved.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    try:
        out = await async_convert_audio_file(resolved, data.format, bitrate=data.bitrate, sample_rate=data.sample_rate)
        # Move to exports dir
        exports = config.get_exports_dir()
        final = exports / f"{resolved.stem}.{data.format}"
        shutil.move(str(out), str(final))
        return {
            "output_path": config.to_storage_path(final),
            "format": data.format,
            "mime": SUPPORTED_FORMATS[data.format]["mime"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/audiobooks/formats")
async def list_formats():
    from ..services.audio_conversion import SUPPORTED_FORMATS, ffmpeg_available

    return {"formats": SUPPORTED_FORMATS, "ffmpeg_available": ffmpeg_available()}
