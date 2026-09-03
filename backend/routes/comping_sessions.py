"""Comping session persistence endpoints."""

from ..database import get_db
from ..database.models import CompingSession
from ._session_store import build_session_router

router = build_session_router(
    prefix="/comping/sessions",
    model=CompingSession,
    tag="comping-sessions",
    db_dep=get_db,
    snapshot_kind="comp",
)
