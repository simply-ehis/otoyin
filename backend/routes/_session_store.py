"""Generic session-persistence CRUD shared by Audio Studio, Comping, Mixer.

Each tab owns a session table (AudioStudioSession / CompingSession /
MixerSession). They share an identical shape and lifecycle:

  * autosave rows are hidden ``is_autosave`` snapshots written on a debounce
  * an explicit Save promotes an autosave row into a named, visible session

This factory wires the five standard endpoints (create / promote / list /
get / update / delete) plus a JSON round-trip, so each tab only supplies its
path prefix and ORM model.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database.models import Base
from ..errors import ERR_NO_UNDO_SNAPSHOTS, ERR_SESSION_NOT_FOUND


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


def _to_response(session: Base) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        name=session.name,
        data=json.loads(session.data) if isinstance(session.data, str) else (session.data or {}),
        is_autosave=bool(session.is_autosave),
        created_at=session.created_at.isoformat() if session.created_at else "",
        updated_at=session.updated_at.isoformat() if session.updated_at else "",
    )


MAX_AUTOSAVE_SNAPSHOTS = 5


class SnapshotResponse(BaseModel):
    id: str
    session_id: str
    data: dict[str, Any]
    kind: str
    created_at: str


def build_session_router(
    prefix: str, model: type, tag: str, db_dep: Callable[..., Session], *, snapshot_kind: str | None = None
) -> APIRouter:
    """Build a session CRUD router for the given table/model.

    ``prefix`` is the full path prefix (e.g. ``/comping/sessions``) and
    ``model`` is the SQLAlchemy ORM class with columns
    ``id, name, data, is_autosave, created_at, updated_at``. ``db_dep`` is the
    FastAPI dependency that yields a SQLAlchemy session.

    If ``snapshot_kind`` is provided (e.g. ``"comp"`` or ``"mixer"``), the
    router also mounts rolling-autosave snapshot endpoints for 5-slot undo.
    """
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.post("", response_model=SessionResponse)
    async def create_session(body: SessionCreate, db: Session = Depends(db_dep)) -> SessionResponse:
        """Save a new session (or hidden autosave row)."""
        session = model(  # type: ignore[call-arg]
            id=str(uuid4()),
            name=body.name,
            data=json.dumps(body.data, default=str),
            is_autosave=body.is_autosave,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return _to_response(session)

    @router.post("/{session_id}/promote", response_model=SessionResponse)
    async def promote_session(session_id: str, body: SessionUpdate, db: Session = Depends(db_dep)) -> SessionResponse:
        """Explicit Save: promote an autosave row into a named session."""
        session = db.query(model).filter_by(id=session_id).first()  # type: ignore[arg-type]
        if not session:
            raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)
        if body.name is not None:
            session.name = body.name
        if body.data is not None:
            session.data = json.dumps(body.data, default=str)
        session.is_autosave = False
        # Delete all autosave snapshots — named save collapses undo history
        if snapshot_kind:
            from ..database.models import SessionAutosaveSnapshot

            db.query(SessionAutosaveSnapshot).filter_by(session_id=session_id, kind=snapshot_kind).delete()
        db.commit()
        db.refresh(session)
        return _to_response(session)

    @router.get("", response_model=list[SessionResponse])
    async def list_sessions(include_autosave: bool = False, db: Session = Depends(db_dep)) -> list[SessionResponse]:
        """List saved sessions; hidden autosave rows excluded by default."""
        query = db.query(model)  # type: ignore[arg-type]
        if not include_autosave:
            query = query.filter(model.is_autosave.is_(False))  # type: ignore[attr-defined]
        rows = query.order_by(model.updated_at.desc()).all()  # type: ignore[attr-defined]
        return [_to_response(s) for s in rows]

    @router.get("/{session_id}", response_model=SessionResponse)
    async def get_session(session_id: str, db: Session = Depends(db_dep)) -> SessionResponse:
        """Get a single session by ID."""
        session = db.query(model).filter_by(id=session_id).first()  # type: ignore[arg-type]
        if not session:
            raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)
        return _to_response(session)

    @router.put("/{session_id}", response_model=SessionResponse)
    async def update_session(session_id: str, body: SessionUpdate, db: Session = Depends(db_dep)) -> SessionResponse:
        """Update a session's name and/or data."""
        session = db.query(model).filter_by(id=session_id).first()  # type: ignore[arg-type]
        if not session:
            raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)
        if body.name is not None:
            session.name = body.name
        if body.data is not None:
            session.data = json.dumps(body.data, default=str)
        db.commit()
        db.refresh(session)
        return _to_response(session)

    @router.delete("/{session_id}")
    async def delete_session(session_id: str, db: Session = Depends(db_dep)) -> dict:
        """Delete a session."""
        session = db.query(model).filter_by(id=session_id).first()  # type: ignore[arg-type]
        if not session:
            raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)
        db.delete(session)
        # Also delete all autosave snapshots for this session
        if snapshot_kind:
            from ..database.models import SessionAutosaveSnapshot

            db.query(SessionAutosaveSnapshot).filter_by(session_id=session_id, kind=snapshot_kind).delete()
        db.commit()
        return {"deleted": session_id}

    # ── Rolling autosave snapshots (only if snapshot_kind is set) ──────
    if snapshot_kind:
        _kind = snapshot_kind  # capture for closures

        @router.post("/{session_id}/autosave-snapshot", response_model=SnapshotResponse)
        async def create_autosave_snapshot(
            session_id: str, body: SessionCreate, db: Session = Depends(db_dep)
        ) -> SnapshotResponse:
            """Insert a new autosave snapshot and prune to keep only the 5 newest."""
            from ..database.models import SessionAutosaveSnapshot

            sess = db.query(model).filter_by(id=session_id).first()  # type: ignore[arg-type]
            if not sess:
                raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)

            snapshot = SessionAutosaveSnapshot(
                session_id=session_id,
                data=json.dumps(body.data, default=str),
                kind=_kind,
            )
            db.add(snapshot)
            db.flush()

            # Prune: keep only the N newest snapshots
            subq = (
                db.query(SessionAutosaveSnapshot.id)
                .filter_by(session_id=session_id, kind=_kind)
                .order_by(SessionAutosaveSnapshot.created_at.desc())
                .limit(MAX_AUTOSAVE_SNAPSHOTS)
                .subquery()
            )
            db.query(SessionAutosaveSnapshot).filter(
                SessionAutosaveSnapshot.session_id == session_id,
                SessionAutosaveSnapshot.kind == _kind,
                ~SessionAutosaveSnapshot.id.in_(subq),
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

        @router.get("/{session_id}/autosave-snapshots", response_model=list[SnapshotResponse])
        async def list_autosave_snapshots(session_id: str, db: Session = Depends(db_dep)) -> list[SnapshotResponse]:
            """List autosave snapshots for a session (newest first, max 5)."""
            from ..database.models import SessionAutosaveSnapshot

            rows = (
                db.query(SessionAutosaveSnapshot)
                .filter_by(session_id=session_id, kind=_kind)
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

        @router.post("/{session_id}/undo-autosave", response_model=SessionResponse)
        async def undo_autosave(session_id: str, db: Session = Depends(db_dep)) -> SessionResponse:
            """Restore the session to its most recent autosave snapshot."""
            from ..database.models import SessionAutosaveSnapshot

            sess = db.query(model).filter_by(id=session_id).first()  # type: ignore[arg-type]
            if not sess:
                raise HTTPException(status_code=404, detail=ERR_SESSION_NOT_FOUND)

            latest = (
                db.query(SessionAutosaveSnapshot)
                .filter_by(session_id=session_id, kind=_kind)
                .order_by(SessionAutosaveSnapshot.created_at.desc())
                .first()
            )
            if not latest:
                raise HTTPException(status_code=404, detail=ERR_NO_UNDO_SNAPSHOTS)

            sess.data = latest.data
            db.delete(latest)
            db.commit()
            db.refresh(sess)
            return _to_response(sess)

    return router
