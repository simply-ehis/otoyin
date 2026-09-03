"""Mixer session persistence endpoints."""

from ..database import get_db
from ..database.models import MixerSession
from ._session_store import build_session_router

router = build_session_router(
    prefix="/mixer/sessions",
    model=MixerSession,
    tag="mixer-sessions",
    db_dep=get_db,
    snapshot_kind="mixer",
)
