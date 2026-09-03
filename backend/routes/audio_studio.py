"""Audio Studio session persistence endpoints."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db

router = APIRouter()


class SessionCreate(BaseModel):
    name: str = "Untitled Session"
    data: dict[str, Any] = {}
    is_autosave: bool = False


class SessionUpdate(BaseModel):
    name: str | None = None
    data: dict[str, Any] | None = None
    is_autosave: bool | None = None


class SessionResponse(BaseModel):
    id: str
    name: str
    data: dict[str, Any]
    is_autosave: bool = False
    created_at: str
    updated_at: str


@router.post("/audio-studio/sessions", response_model=SessionResponse)
async def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    """Save a new Audio Studio session (or hidden autosave row)."""
    from ..database.models import AudioStudioSession

    session = AudioStudioSession(
        id=str(uuid4()),
        name=body.name,
        data=json.dumps(body.data, default=str),
        is_autosave=body.is_autosave,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.post("/audio-studio/sessions/{session_id}/promote", response_model=SessionResponse)
async def promote_session(session_id: str, body: SessionUpdate, db: Session = Depends(get_db)):
    """Explicit Save: promote an autosave row into a named, committed session.

    Sets a real name and clears the is_autosave flag so it becomes visible in
    the user's session list. This is the only moment a session gets a
    human-readable name.
    """
    from ..database.models import AudioStudioSession

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if body.name is not None:
        session.name = body.name
    if body.data is not None:
        session.data = json.dumps(body.data, default=str)
    session.is_autosave = False
    # Delete all autosave snapshots — named save collapses undo history
    from ..database.models import SessionAutosaveSnapshot

    db.query(SessionAutosaveSnapshot).filter_by(session_id=session_id).delete()
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.get("/audio-studio/sessions", response_model=list[SessionResponse])
async def list_sessions(include_autosave: bool = False, db: Session = Depends(get_db)):
    """List saved Audio Studio sessions.

    Hidden autosave rows are excluded by default so they don't clutter the
    user's session list; pass include_autosave=true to surface them.
    """
    from ..database.models import AudioStudioSession

    query = db.query(AudioStudioSession)
    if not include_autosave:
        query = query.filter(AudioStudioSession.is_autosave.is_(False))
    rows = query.order_by(AudioStudioSession.updated_at.desc()).all()
    return [_to_response(s) for s in rows]


@router.get("/audio-studio/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get a single session by ID."""
    from ..database.models import AudioStudioSession

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_response(session)


@router.put("/audio-studio/sessions/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, body: SessionUpdate, db: Session = Depends(get_db)):
    """Update a session's name and/or data."""
    from ..database.models import AudioStudioSession

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if body.name is not None:
        session.name = body.name
    if body.data is not None:
        session.data = json.dumps(body.data, default=str)
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.delete("/audio-studio/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a session."""
    from ..database.models import AudioStudioSession

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    # Also delete all autosave snapshots for this session
    from ..database.models import SessionAutosaveSnapshot

    db.query(SessionAutosaveSnapshot).filter_by(session_id=session_id).delete()
    db.commit()
    return {"deleted": session_id}


# ── Tracks & master volume (tool-surface endpoints) ──────────────────────


class TrackAddRequest(BaseModel):
    track: dict[str, Any]


class MasterVolumeRequest(BaseModel):
    volume: float


def _load_session_data(session) -> dict[str, Any]:
    try:
        data = json.loads(session.data) if session.data else {}
    except (TypeError, ValueError):
        data = {}
    return data if isinstance(data, dict) else {}


@router.post("/audio-studio/sessions/{session_id}/tracks", response_model=SessionResponse)
async def add_track(session_id: str, body: TrackAddRequest, db: Session = Depends(get_db)):
    """Append one track to a session's track list."""
    from ..database.models import AudioStudioSession

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    data = _load_session_data(session)
    tracks = data.setdefault("tracks", [])
    if not isinstance(tracks, list):
        raise HTTPException(status_code=400, detail="Session data['tracks'] is not a list")
    tracks.append(body.track)
    session.data = json.dumps(data, default=str)
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.post("/audio-studio/sessions/{session_id}/master-volume", response_model=SessionResponse)
async def set_master_volume(session_id: str, body: MasterVolumeRequest, db: Session = Depends(get_db)):
    """Set the session master volume (0.0-1.5)."""
    from ..database.models import AudioStudioSession

    if not 0.0 <= body.volume <= 1.5:
        raise HTTPException(status_code=422, detail="volume must be between 0.0 and 1.5")
    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    data = _load_session_data(session)
    data["master_volume"] = body.volume
    session.data = json.dumps(data, default=str)
    db.commit()
    db.refresh(session)
    return _to_response(session)


@router.post("/audio-studio/sessions/import", response_model=SessionResponse)
async def import_session(body: SessionCreate, db: Session = Depends(get_db)):
    """Import a previously exported session payload as a new named session."""
    from ..database.models import AudioStudioSession

    session = AudioStudioSession(
        id=str(uuid4()),
        name=body.name or "Imported Session",
        data=json.dumps(body.data, default=str),
        is_autosave=False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_response(session)


# ── Rolling autosave snapshots (5-slot undo stack) ───────────────────────

MAX_AUTOSAVE_SNAPSHOTS = 5


class SnapshotResponse(BaseModel):
    id: str
    session_id: str
    data: dict[str, Any]
    kind: str
    created_at: str


@router.post("/audio-studio/sessions/{session_id}/autosave-snapshot", response_model=SnapshotResponse)
async def create_autosave_snapshot(session_id: str, body: SessionCreate, db: Session = Depends(get_db)):
    """Insert a new autosave snapshot and prune to keep only the 5 newest.

    This replaces the old single-overwrite autosave.  Each call creates a new
    versioned snapshot; the rolling window ensures only 5 exist per session.
    """
    from ..database.models import AudioStudioSession, SessionAutosaveSnapshot

    # Verify session exists
    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Insert new snapshot
    snapshot = SessionAutosaveSnapshot(
        session_id=session_id,
        data=json.dumps(body.data, default=str),
        kind=body.name or "studio",
    )
    db.add(snapshot)
    db.flush()  # get the created_at timestamp

    # Prune: keep only the 5 newest snapshots for this session
    from sqlalchemy import select

    subq = (
        select(SessionAutosaveSnapshot.id)
        .filter_by(session_id=session_id)
        .order_by(SessionAutosaveSnapshot.created_at.desc())
        .limit(MAX_AUTOSAVE_SNAPSHOTS)
        .subquery()
    )
    db.query(SessionAutosaveSnapshot).filter(
        SessionAutosaveSnapshot.session_id == session_id,
        ~SessionAutosaveSnapshot.id.in_(select(subq.c.id)),
    ).delete(synchronize_session=False)

    db.commit()
    db.refresh(snapshot)
    return SnapshotResponse(
        id=snapshot.id,
        session_id=snapshot.session_id,
        data=json.loads(snapshot.data) if isinstance(snapshot.data, str) else (snapshot.data or {}),
        kind=snapshot.kind,
        created_at=snapshot.created_at.isoformat() if snapshot.created_at else "",
    )


@router.get("/audio-studio/sessions/{session_id}/autosave-snapshots", response_model=list[SnapshotResponse])
async def list_autosave_snapshots(session_id: str, db: Session = Depends(get_db)):
    """List autosave snapshots for a session (newest first, max 5)."""
    from ..database.models import SessionAutosaveSnapshot

    rows = (
        db.query(SessionAutosaveSnapshot)
        .filter_by(session_id=session_id)
        .order_by(SessionAutosaveSnapshot.created_at.desc())
        .limit(MAX_AUTOSAVE_SNAPSHOTS)
        .all()
    )
    return [
        SnapshotResponse(
            id=s.id,
            session_id=s.session_id,
            data=json.loads(s.data) if isinstance(s.data, str) else (s.data or {}),
            kind=s.kind,
            created_at=s.created_at.isoformat() if s.created_at else "",
        )
        for s in rows
    ]


@router.post("/audio-studio/sessions/{session_id}/undo-autosave", response_model=SessionResponse)
async def undo_autosave(session_id: str, db: Session = Depends(get_db)):
    """Restore the session to its most recent autosave snapshot.

    The restored snapshot is deleted (consumed), and the session data is
    overwritten with the snapshot's data.  The user gets one level of undo
    per snapshot in the stack.
    """
    from ..database.models import AudioStudioSession, SessionAutosaveSnapshot

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    latest = (
        db.query(SessionAutosaveSnapshot)
        .filter_by(session_id=session_id)
        .order_by(SessionAutosaveSnapshot.created_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=404, detail="No autosave snapshots to undo")

    # Restore session data from snapshot
    session.data = latest.data
    db.delete(latest)  # consume the snapshot
    db.commit()
    db.refresh(session)
    return _to_response(session)


def _to_response(session) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        name=session.name,
        data=json.loads(session.data) if isinstance(session.data, str) else (session.data or {}),
        is_autosave=bool(session.is_autosave),
        created_at=session.created_at.isoformat() if session.created_at else "",
        updated_at=session.updated_at.isoformat() if session.updated_at else "",
    )


@router.post("/audio-studio/sessions/{session_id}/export-reaper")
async def export_reaper(session_id: str, db: Session = Depends(get_db)):
    """Export an Audio Studio session as a Reaper project (.RPP) for DAW interchange."""
    from ..database.models import AudioStudioSession

    session = db.query(AudioStudioSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session_data = json.loads(session.data) if isinstance(session.data, str) else (session.data or {})
    from ..services.daw_export import build_reaper_project

    rpp = build_reaper_project(session_data, name=session.name or "TWENTYLABSSession")
    safe = f"{session.name or 'session'}.rpp".replace(" ", "_")
    return Response(
        content=rpp,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{safe}"',
        },
    )
