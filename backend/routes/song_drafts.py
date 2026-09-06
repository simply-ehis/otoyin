"""Songwriter draft endpoints (song DNA + lyrics, ported from Resonant)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import SongDraft as DBSongDraft, get_db
from ..errors import ERR_INVALID_REQUEST

router = APIRouter()


def _to_response(row: DBSongDraft) -> models.SongDraftResponse:
    payload = row.draft_json or {}
    return models.SongDraftResponse(
        id=row.id,
        title=row.title or "",
        language=row.language or "en",
        draft=models.SongDraftPayload(**payload),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/song-drafts", response_model=list[models.SongDraftResponse])
async def list_song_drafts(db: Session = Depends(get_db)):
    """List songwriter drafts, newest first."""
    rows = db.query(DBSongDraft).order_by(DBSongDraft.updated_at.desc()).all()
    return [_to_response(row) for row in rows]


@router.post("/song-drafts", response_model=models.SongDraftResponse)
async def create_song_draft(data: models.SongDraftCreate, db: Session = Depends(get_db)):
    """Create a songwriter draft."""
    row = DBSongDraft(
        title=data.title or data.draft.title,
        language=data.language or data.draft.language or "en",
        draft_json=data.draft.model_dump(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.get("/song-drafts/{draft_id}", response_model=models.SongDraftResponse)
async def get_song_draft(draft_id: str, db: Session = Depends(get_db)):
    """Get one songwriter draft."""
    row = db.query(DBSongDraft).filter_by(id=draft_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    return _to_response(row)


@router.put("/song-drafts/{draft_id}", response_model=models.SongDraftResponse)
async def update_song_draft(draft_id: str, data: models.SongDraftCreate, db: Session = Depends(get_db)):
    """Replace a songwriter draft."""
    row = db.query(DBSongDraft).filter_by(id=draft_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    row.title = data.title or data.draft.title
    row.language = data.language or data.draft.language or "en"
    row.draft_json = data.draft.model_dump()
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/song-drafts/{draft_id}", status_code=204)
async def delete_song_draft(draft_id: str, db: Session = Depends(get_db)):
    """Delete a songwriter draft."""
    row = db.query(DBSongDraft).filter_by(id=draft_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    db.delete(row)
    db.commit()
