"""Unified Audio Library — aggregates generations, captures, and profile samples.

Provides a single searchable, taggable, batch-operable view over all audio
the app stores. The library itself is virtual (no new audio table); tags are
persisted in library_tags + library_item_tags.
"""

from __future__ import annotations

import contextlib
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import config
from ..database import Capture as DBCapture, Generation as DBGeneration, ProfileSample as DBProfileSample
from ..database.models import LibraryItemTag as DBLibraryItemTag, LibraryTag as DBLibraryTag
from ..database.session import get_db

router = APIRouter()

LibraryKind = Literal["generation", "capture", "profile_sample", "generation_version"]


# ── Pydantic models ───────────────────────────────────────────────────────────


class LibraryTagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str | None = Field(None, max_length=20)


class LibraryTagResponse(BaseModel):
    id: str
    name: str
    color: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LibraryItemTagRequest(BaseModel):
    tag_id: str | None = None
    tag_name: str | None = Field(None, max_length=50)
    color: str | None = None


class LibraryBatchDeleteRequest(BaseModel):
    items: list[dict]  # [{kind, id}]


class LibraryBatchTagRequest(BaseModel):
    items: list[dict]
    tag_id: str | None = None
    tag_name: str | None = None
    color: str | None = None
    action: Literal["add", "remove"] = "add"


class LibraryItemResponse(BaseModel):
    id: str
    kind: str
    title: str
    audio_path: str | None
    audio_url: str | None
    duration: float | None
    duration_ms: int | None
    created_at: datetime | None
    status: str | None = None
    source: str | None = None
    profile_name: str | None = None
    engine: str | None = None
    tags: list[LibraryTagResponse] = []


class LibraryListResponse(BaseModel):
    items: list[LibraryItemResponse]
    total: int
    page: int
    limit: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _tags_map(db: Session, keys: list[tuple[str, str]]) -> dict[tuple[str, str], list[DBLibraryTag]]:
    if not keys:
        return {}
    # Only fetch mappings for the requested items — avoids loading the whole table
    wanted_ids = {iid for _, iid in keys}
    wanted_kinds = {k for k, _ in keys}
    rows = (
        db.query(DBLibraryItemTag, DBLibraryTag)
        .join(DBLibraryTag, DBLibraryItemTag.tag_id == DBLibraryTag.id)
        .filter(DBLibraryItemTag.item_id.in_(wanted_ids))
        .filter(DBLibraryItemTag.item_kind.in_(wanted_kinds))
        .all()
    )
    m: dict[tuple[str, str], list[DBLibraryTag]] = {}
    wanted_set = set(keys)
    for mapping, tag in rows:
        k = (mapping.item_kind, mapping.item_id)
        if k in wanted_set:
            m.setdefault(k, []).append(tag)
    return m


def _audio_url(kind: str, item_id: str) -> str | None:
    if kind == "generation":
        return f"/audio/{item_id}"
    if kind == "capture":
        return f"/captures/{item_id}/audio"
    if kind == "profile_sample":
        return f"/samples/{item_id}"
    if kind == "generation_version":
        return f"/audio/version/{item_id}"
    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/library/tags", response_model=list[LibraryTagResponse])
async def list_tags(db: Session = Depends(get_db)):
    tags = db.query(DBLibraryTag).order_by(DBLibraryTag.name).all()
    return tags


@router.post("/library/tags", response_model=LibraryTagResponse, status_code=201)
async def create_tag(payload: LibraryTagCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name cannot be empty")
    existing = db.query(DBLibraryTag).filter(DBLibraryTag.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag already exists")
    tag = DBLibraryTag(id=str(uuid.uuid4()), name=name, color=payload.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/library/tags/{tag_id}")
async def delete_tag(tag_id: str, db: Session = Depends(get_db)):
    tag = db.query(DBLibraryTag).filter(DBLibraryTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.query(DBLibraryItemTag).filter(DBLibraryItemTag.tag_id == tag_id).delete()
    db.delete(tag)
    db.commit()
    return {"message": "Tag deleted"}


@router.post("/library/items/{kind}/{item_id}/tags", response_model=LibraryTagResponse)
async def add_tag_to_item(kind: str, item_id: str, payload: LibraryItemTagRequest, db: Session = Depends(get_db)):
    if kind not in ("generation", "capture", "profile_sample", "generation_version"):
        raise HTTPException(status_code=400, detail="Invalid kind")
    # Resolve tag
    tag = None
    if payload.tag_id:
        tag = db.query(DBLibraryTag).filter(DBLibraryTag.id == payload.tag_id).first()
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")
    elif payload.tag_name:
        name = payload.tag_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Tag name cannot be empty")
        tag = db.query(DBLibraryTag).filter(DBLibraryTag.name == name).first()
        if not tag:
            tag = DBLibraryTag(id=str(uuid.uuid4()), name=name, color=payload.color)
            db.add(tag)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="tag_id or tag_name required")
    # Check duplicate
    existing = (
        db.query(DBLibraryItemTag)
        .filter(
            DBLibraryItemTag.item_id == item_id,
            DBLibraryItemTag.item_kind == kind,
            DBLibraryItemTag.tag_id == tag.id,
        )
        .first()
    )
    if existing:
        return tag
    mapping = DBLibraryItemTag(item_id=item_id, item_kind=kind, tag_id=tag.id)
    db.add(mapping)
    db.commit()
    return tag


@router.delete("/library/items/{kind}/{item_id}/tags/{tag_id}")
async def remove_tag_from_item(kind: str, item_id: str, tag_id: str, db: Session = Depends(get_db)):
    mapping = (
        db.query(DBLibraryItemTag)
        .filter(
            DBLibraryItemTag.item_id == item_id,
            DBLibraryItemTag.item_kind == kind,
            DBLibraryItemTag.tag_id == tag_id,
        )
        .first()
    )
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(mapping)
    db.commit()
    return {"message": "Tag removed"}


@router.get("/library", response_model=LibraryListResponse)
async def list_library(
    q: str | None = Query(None, max_length=200),
    kind: str | None = Query(None),
    tag: str | None = Query(None),
    sort: str = Query("newest", pattern="^(newest|oldest|duration|name)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    # Validate kind filter
    allowed_kinds = {"generation", "capture", "profile_sample", "generation_version"}
    if kind and kind not in allowed_kinds:
        raise HTTPException(status_code=400, detail="Invalid kind")

    # Collect items from each source
    all_items: list[LibraryItemResponse] = []

    # Preload tags mapping for all items (lazy: build after collecting)
    # For tag filter, we need to know which item_ids have the tag
    tag_filter_ids: set[tuple[str, str]] | None = None
    if tag:
        tag_obj = db.query(DBLibraryTag).filter(or_(DBLibraryTag.id == tag, DBLibraryTag.name == tag)).first()
        if not tag_obj:
            return LibraryListResponse(items=[], total=0, page=page, limit=limit)
        rows = db.query(DBLibraryItemTag).filter(DBLibraryItemTag.tag_id == tag_obj.id).all()
        tag_filter_ids = {(r.item_kind, r.item_id) for r in rows}

    def _passes_tag_filter(k: str, iid: str) -> bool:
        if tag_filter_ids is None:
            return True
        return (k, iid) in tag_filter_ids

    def _passes_query(title: str, text: str | None = None) -> bool:
        if not q:
            return True
        needle = q.lower()
        return needle in title.lower() or (text and needle in text.lower())

    # ── Generations ───────────────────────────────────────────────────────
    if not kind or kind == "generation":
        gens = db.query(DBGeneration).all()
        for g in gens:
            if not _passes_tag_filter("generation", g.id):
                continue
            title = (g.text or "")[:80] or f"Generation {g.id[:8]}"
            if not _passes_query(title, g.text):
                continue
            all_items.append(
                LibraryItemResponse(
                    id=g.id,
                    kind="generation",
                    title=title,
                    audio_path=g.audio_path,
                    audio_url=_audio_url("generation", g.id) if g.audio_path else None,
                    duration=g.duration,
                    duration_ms=int(g.duration * 1000) if g.duration else None,
                    created_at=g.created_at,
                    status=g.status,
                    source=g.source,
                    engine=g.engine,
                    tags=[],
                )
            )

    # ── Captures ──────────────────────────────────────────────────────────
    if not kind or kind == "capture":
        caps = db.query(DBCapture).all()
        for c in caps:
            if not _passes_tag_filter("capture", c.id):
                continue
            raw = c.transcript_refined or c.transcript_raw or ""
            title = raw[:80] or f"Capture {c.id[:8]}"
            if not _passes_query(title, raw):
                continue
            all_items.append(
                LibraryItemResponse(
                    id=c.id,
                    kind="capture",
                    title=title,
                    audio_path=c.audio_path,
                    audio_url=_audio_url("capture", c.id),
                    duration=(c.duration_ms / 1000) if c.duration_ms else None,
                    duration_ms=c.duration_ms,
                    created_at=c.created_at,
                    status=None,
                    source=c.source,
                    engine=None,
                    tags=[],
                )
            )

    # ── Profile samples ───────────────────────────────────────────────────
    if not kind or kind == "profile_sample":
        samples = db.query(DBProfileSample).all()
        # Need profile names for title
        from ..database.models import VoiceProfile as DBProfile

        profiles = {p.id: p.name for p in db.query(DBProfile).all()}
        for s in samples:
            if not _passes_tag_filter("profile_sample", s.id):
                continue
            title = s.reference_text[:80] or f"Sample {s.id[:8]} ({profiles.get(s.profile_id, 'profile')})"
            if not _passes_query(title, s.reference_text):
                continue
            all_items.append(
                LibraryItemResponse(
                    id=s.id,
                    kind="profile_sample",
                    title=title,
                    audio_path=s.audio_path,
                    audio_url=_audio_url("profile_sample", s.id),
                    duration=None,
                    duration_ms=None,
                    created_at=None,
                    status=None,
                    source="profile_sample",
                    profile_name=profiles.get(s.profile_id),
                    tags=[],
                )
            )

    # ── Generation versions (revisions / alternate takes) ─────────────────
    if not kind or kind == "generation_version":
        from ..database.models import GenerationVersion as DBVersion

        vers = db.query(DBVersion).all()
        for v in vers:
            if not _passes_tag_filter("generation_version", v.id):
                continue
            title = v.label[:80] or f"Version {v.id[:8]}"
            if not _passes_query(title, v.label):
                continue
            all_items.append(
                LibraryItemResponse(
                    id=v.id,
                    kind="generation_version",
                    title=title,
                    audio_path=v.audio_path,
                    audio_url=_audio_url("generation_version", v.id) if v.audio_path else None,
                    duration=None,
                    duration_ms=None,
                    created_at=v.created_at,
                    status=None,
                    source="generation_version",
                    tags=[],
                )
            )

    # ── Attach tags ───────────────────────────────────────────────────────
    keys = [(it.kind, it.id) for it in all_items]
    tag_map = _tags_map(db, keys)
    for it in all_items:
        tags = tag_map.get((it.kind, it.id), [])
        it.tags = [LibraryTagResponse.model_validate(t) for t in tags]

    # ── Sort ──────────────────────────────────────────────────────────────
    # Use timezone-aware min so comparison with UTC datetimes never mixes naive/aware

    _min_dt = datetime.min.replace(tzinfo=UTC)
    if sort == "newest":
        all_items.sort(key=lambda x: x.created_at or _min_dt, reverse=True)
    elif sort == "oldest":
        all_items.sort(key=lambda x: x.created_at or _min_dt)
    elif sort == "duration":
        # Longest first; stable secondary sort by newest so equal durations are deterministic
        all_items.sort(key=lambda x: (x.duration_ms or 0, x.created_at or _min_dt), reverse=True)
    elif sort == "name":
        all_items.sort(key=lambda x: x.title.lower())

    total = len(all_items)
    start = (page - 1) * limit
    end = start + limit
    paged = all_items[start:end]

    return LibraryListResponse(items=paged, total=total, page=page, limit=limit)


@router.post("/library/batch/delete")
async def batch_delete(payload: LibraryBatchDeleteRequest, db: Session = Depends(get_db)):
    deleted = 0
    for entry in payload.items:
        kind = entry.get("kind")
        iid = entry.get("id")
        if not kind or not iid:
            continue
        try:
            if kind == "generation":
                # Remove versions + story refs + files before deleting the generation
                from ..database.models import GenerationVersion as DBVersion, StoryItem as DBStoryItem

                for v in db.query(DBVersion).filter(DBVersion.generation_id == iid).all():
                    if v.audio_path:
                        p = config.resolve_storage_path(v.audio_path)
                        if p and p.exists():
                            with contextlib.suppress(Exception):
                                p.unlink()
                    db.delete(v)
                db.query(DBStoryItem).filter(DBStoryItem.generation_id == iid).delete()
                row = db.query(DBGeneration).filter(DBGeneration.id == iid).first()
                if row:
                    if row.audio_path:
                        p = config.resolve_storage_path(row.audio_path)
                        if p and p.exists():
                            with contextlib.suppress(Exception):
                                p.unlink()
                    # Also remove chunk files for streaming playback
                    generations_dir = config.get_generations_dir()
                    for chunk in generations_dir.glob(f"{iid}_chunk_*.wav"):
                        with contextlib.suppress(Exception):
                            chunk.unlink()
                    db.delete(row)
                    deleted += 1
            elif kind == "capture":
                row = db.query(DBCapture).filter(DBCapture.id == iid).first()
                if row:
                    if row.audio_path:
                        p = config.resolve_storage_path(row.audio_path)
                        if p and p.exists():
                            with contextlib.suppress(Exception):
                                p.unlink()
                    db.delete(row)
                    deleted += 1
            elif kind == "profile_sample":
                row = db.query(DBProfileSample).filter(DBProfileSample.id == iid).first()
                if row:
                    if row.audio_path:
                        p = config.resolve_storage_path(row.audio_path)
                        if p and p.exists():
                            with contextlib.suppress(Exception):
                                p.unlink()
                    db.delete(row)
                    deleted += 1
            elif kind == "generation_version":
                from ..database.models import GenerationVersion as DBVersion

                row = db.query(DBVersion).filter(DBVersion.id == iid).first()
                if row:
                    if row.audio_path:
                        p = config.resolve_storage_path(row.audio_path)
                        if p and p.exists():
                            with contextlib.suppress(Exception):
                                p.unlink()
                    # Clear any story_item pointing at this version
                    from ..database.models import StoryItem as DBStoryItem

                    db.query(DBStoryItem).filter(DBStoryItem.version_id == iid).update({DBStoryItem.version_id: None})
                    db.delete(row)
                    deleted += 1
            # Clean tags for this item
            db.query(DBLibraryItemTag).filter(
                DBLibraryItemTag.item_id == iid, DBLibraryItemTag.item_kind == kind
            ).delete()
        except Exception:
            continue
    db.commit()
    return {"deleted": deleted}


@router.post("/library/batch/tag")
async def batch_tag(payload: LibraryBatchTagRequest, db: Session = Depends(get_db)):
    # Resolve tag
    tag = None
    if payload.tag_id:
        tag = db.query(DBLibraryTag).filter(DBLibraryTag.id == payload.tag_id).first()
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")
    elif payload.tag_name:
        name = payload.tag_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Tag name required")
        tag = db.query(DBLibraryTag).filter(DBLibraryTag.name == name).first()
        if not tag:
            tag = DBLibraryTag(id=str(uuid.uuid4()), name=name, color=payload.color)
            db.add(tag)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="tag_id or tag_name required")

    affected = 0
    for entry in payload.items:
        kind = entry.get("kind")
        iid = entry.get("id")
        if not kind or not iid:
            continue
        existing = (
            db.query(DBLibraryItemTag)
            .filter(
                DBLibraryItemTag.item_id == iid,
                DBLibraryItemTag.item_kind == kind,
                DBLibraryItemTag.tag_id == tag.id,
            )
            .first()
        )
        if payload.action == "add":
            if not existing:
                db.add(DBLibraryItemTag(item_id=iid, item_kind=kind, tag_id=tag.id))
                affected += 1
        else:  # remove
            if existing:
                db.delete(existing)
                affected += 1
    db.commit()
    return {"tag": LibraryTagResponse.model_validate(tag), "affected": affected}
