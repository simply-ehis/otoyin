"""Cross-tab clipboard: a single-slot, server-backed copy/paste buffer.

Lets a clip created in one tab or Tauri window be pasted into another. The
slot is identified by a fixed id so every client reads/writes the same row.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..errors import ERR_EMPTY_CLIPSBOARD, ERR_INVALID_REQUEST

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_KINDS = {
    "sample",
    "capture",
    "generation",
    "story_item",
    "studio_track",
    "adr_take",
    "comp",
    "mixer_state",
}


class ClipPut(BaseModel):
    kind: str
    entity_id: str
    name: str = ""
    duration_ms: int | None = None
    audio_url: str | None = None


class ClipResponse(BaseModel):
    kind: str
    entity_id: str
    name: str
    duration_ms: int | None
    audio_url: str | None
    created_at: str


def _to_response(row: Any) -> ClipResponse:
    return ClipResponse(
        kind=row.kind,
        entity_id=row.entity_id,
        name=row.name,
        duration_ms=row.duration_ms,
        audio_url=row.audio_url,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


@router.put("/clipboard", response_model=ClipResponse)
async def put_clip(body: ClipPut, db: Session = Depends(get_db)):
    """Copy a clip into the single clipboard slot (replaces any existing)."""
    from ..database.models import ClipboardItem

    if body.kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=ERR_INVALID_REQUEST)
    if not body.entity_id:
        raise HTTPException(status_code=400, detail=ERR_INVALID_REQUEST)

    slot = db.get(ClipboardItem, ClipboardItem.SLOT_ID)
    if slot is None:
        slot = ClipboardItem(id=ClipboardItem.SLOT_ID)
        db.add(slot)
    slot.kind = body.kind
    slot.entity_id = body.entity_id
    slot.name = body.name
    slot.duration_ms = body.duration_ms
    slot.audio_url = body.audio_url
    db.commit()
    db.refresh(slot)
    return _to_response(slot)


@router.get("/clipboard", response_model=ClipResponse)
async def get_clip(db: Session = Depends(get_db)):
    """Read the current clipboard slot."""
    from ..database.models import ClipboardItem

    slot = db.get(ClipboardItem, ClipboardItem.SLOT_ID)
    if slot is None:
        raise HTTPException(status_code=404, detail=ERR_EMPTY_CLIPSBOARD)
    return _to_response(slot)


@router.delete("/clipboard", status_code=204)
async def clear_clip(db: Session = Depends(get_db)):
    """Clear the clipboard slot."""
    from ..database.models import ClipboardItem

    slot = db.get(ClipboardItem, ClipboardItem.SLOT_ID)
    if slot is not None:
        db.delete(slot)
        db.commit()
