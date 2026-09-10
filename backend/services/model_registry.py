"""Download manifest — the DB-backed source of truth for model entitlement.

A model may only be loaded if a row exists in ``model_downloads``. This is the
tamper-evident gate that replaces the old "download-on-first-use" behavior: it
is a SQL table (not user-editable JSON), keyed by the global catalog
``(model_name, model_size)``, so casual bypass from the app UI is impossible.

A row surviving a missing file is intentional: the Models page can offer a
free re-download instead of silently re-fetching on use.
"""

from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import ModelDownload

logger = logging.getLogger(__name__)

# Test seam + production fallback. In production this stays None until
# init_db() runs (this module is imported earlier, at route registration);
# _session_factory() then resolves the real sessionmaker lazily. Tests
# monkeypatch this attribute directly.
SessionLocal = None


def _session_factory():
    """Late-binding resolver: prefer the monkeypatch/test seam, else init_db's."""
    sl = globals().get("SessionLocal")
    if sl is None:
        from ..database import session as _db_session

        sl = _db_session.SessionLocal
    return sl


# Friendly, audio-flavored message surfaced to the user when a model hasn't
# been downloaded. Kept here so every gate (LLM, STT, agents, MCP) shares one
# consistent message instead of leaking filesystem paths.
MODEL_NOT_DOWNLOADED_MSG = "Ehm ehm — that model isn't downloaded yet. Grab it from the Models tab first."
MODEL_FILE_MISSING_MSG = "Model files look missing — re-download this model from the Models tab."


class ModelNotDownloadedError(RuntimeError):
    """Raised when a load is attempted for a model with no manifest row."""

    def __init__(self, model_name: str, model_size: str | None = None) -> None:
        self.model_name = model_name
        self.model_size = model_size
        super().__init__(f"{MODEL_NOT_DOWNLOADED_MSG} ({model_name})")


class ModelFileMissingError(RuntimeError):
    """Manifest row exists but the on-disk file is gone (offer re-download)."""


def _session(owned: Session | None) -> tuple[Session, bool]:
    if owned is not None:
        return owned, False
    factory = _session_factory()
    if factory is None:
        raise RuntimeError("Database not initialized (init_db has not run yet)")
    return factory(), True


def is_downloaded(model_name: str, model_size: str | None = None, db: Session | None = None) -> bool:
    """True if this install has a manifest entry (user has downloaded it)."""
    if db is None and _session_factory() is None:
        return False
    owned, opened = _session(db)
    try:
        stmt = select(ModelDownload).where(ModelDownload.model_name == model_name)
        if model_size is not None:
            stmt = stmt.where(ModelDownload.model_size == model_size)
        else:
            stmt = stmt.where(ModelDownload.model_size.is_(None))
        return owned.execute(stmt).first() is not None
    finally:
        if opened:
            owned.close()


def record_download(
    db: Session,
    model_name: str,
    model_size: str | None,
    engine: str,
    hf_repo_id: str | None,
    local_path: str | Path | None,
    file_size_bytes: int | None = None,
) -> ModelDownload:
    """Upsert a manifest row on successful download (idempotent)."""
    row = db.execute(
        select(ModelDownload).where(
            ModelDownload.model_name == model_name,
            ModelDownload.model_size == (model_size if model_size is not None else None),
        )
    ).first()
    # row is a Row; extract the ORM object
    existing = row[0] if row else None
    if existing is None:
        existing = ModelDownload(
            model_name=model_name,
            model_size=model_size,
            engine=engine,
            hf_repo_id=hf_repo_id,
            local_path=str(local_path) if local_path else None,
            file_size_bytes=file_size_bytes,
        )
        db.add(existing)
    else:
        existing.engine = engine
        existing.hf_repo_id = hf_repo_id
        existing.local_path = str(local_path) if local_path else None
        existing.file_size_bytes = file_size_bytes
    db.commit()
    db.refresh(existing)
    return existing


def forget_download(model_name: str, model_size: str | None = None, db: Session | None = None) -> bool:
    """Remove a manifest row (called on model deletion). Returns whether a row existed."""
    owned, opened = _session(db)
    try:
        stmt = ModelDownload.__table__.delete().where(ModelDownload.model_name == model_name)
        if model_size is not None:
            stmt = stmt.where(ModelDownload.model_size == model_size)
        else:
            stmt = stmt.where(ModelDownload.model_size.is_(None))
        result = owned.execute(stmt)
        owned.commit()
        if opened:
            owned.close()
        return result.rowcount > 0
    except Exception:
        if opened:
            owned.rollback()
            owned.close()
        raise


def list_downloads(db: Session | None = None) -> list[ModelDownload]:
    owned, opened = _session(db)
    try:
        rows = owned.execute(select(ModelDownload)).scalars().all()
        return rows
    finally:
        if opened:
            owned.close()


def local_status_for(model_name: str, model_size: str | None = None) -> str:
    """Catalog-facing install state for a product: ``"cached"`` or ``"not_downloaded"``.

    Resolves the real ``model_size`` from the model config when not given
    (manifest rows record the size, so a bare ``is_downloaded(name)`` query
    would miss sized models). Bundled models that are physically present get
    manifest rows via ``reconcile_downloads()`` at startup, so they report
    ``"cached"`` on real installs; the no-config branch below covers any
    future non-model product (ships with the app by definition).

    Any DB/init failure falls back to ``"not_downloaded"`` — the safe
    direction, since it routes the user to the install flow rather than
    claiming a model is present when it may not be.
    """
    from ..backends import get_model_config

    if model_size is None:
        cfg = get_model_config(model_name)
        model_size = cfg.model_size if cfg is not None else None
    try:
        if is_downloaded(model_name, model_size):
            return "cached"
    except Exception:
        return "not_downloaded"
    if get_model_config(model_name) is None:
        # Non-model product — ships with the app (no manifest entry expected).
        return "cached"
    return "not_downloaded"


def assert_downloaded(model_name: str, model_size: str | None = None, db: Session | None = None) -> None:
    """Raise ModelNotDownloadedError if no manifest row exists for this model."""
    if not is_downloaded(model_name, model_size, db=db):
        raise ModelNotDownloadedError(model_name, model_size)


def seed_download(recorded: tuple[str, str | None, str, str | None, str | None], db: Session | None = None) -> None:
    """Record an already-cached model into the manifest (used to backfill)."""
    model_name, model_size, engine, hf_repo, local_path = recorded
    if db is None:
        factory = _session_factory()
        if factory is None:
            raise RuntimeError("Database not initialized (init_db has not run yet)")
        db = factory()
    record_download(db, model_name, model_size, engine, hf_repo, local_path)


def reconcile_downloads() -> int:
    """Backfill the manifest from files already present on disk.

    Runs only when the manifest is empty (no-op afterwards), so bundled installs
    — where the build-time bootstrap pre-populated the HF cache — are recorded as
    entitled without forcing the user to re-download. Does NOT invent rows for
    models that aren't physically cached; a model the user never obtained stays
    blocked at the gate.
    """
    from ..backends import get_all_model_configs
    from ..utils.model_status import is_model_downloaded

    factory = _session_factory()
    if factory is None:
        logger.warning("Manifest reconciliation skipped: database not initialized")
        return 0
    db = factory()
    try:
        if db.query(ModelDownload).first() is not None:
            return 0
        added = 0
        for cfg in get_all_model_configs():
            try:
                present = is_model_downloaded(cfg.model_name)
            except Exception:
                logger.debug("Download check failed for model", exc_info=True)
                continue
            if present:
                record_download(db, cfg.model_name, cfg.model_size, cfg.engine, cfg.hf_repo_id, None, None)
                added += 1
        if added:
            db.commit()
        logger.info("Reconciled %d cached model(s) into the download manifest", added)
        return added
    finally:
        db.close()


# How often /models/status may re-run the cached-model backfill. The check is
# one cheap SQL query ("does the manifest have any rows at all?") per window;
# the reconcile body itself only does disk I/O when drift is detected.
_RECONCILE_INTERVAL_SEC = 60.0
_reconcile_last_attempt: float | None = None


def reconcile_cached_backfill(min_interval_sec: float = _RECONCILE_INTERVAL_SEC) -> int:
    """No-op — kept for call-site compatibility.

    Previously this auto-created manifest rows for any model found on disk,
    which bypassed the marketplace purchase gate (any copied HF cache file
    became usable).  The download endpoint now creates rows atomically on
    completion, and ``reconcile_downloads()`` seeds bundled models on first
    launch.  This function is retained as a no-op so existing callers
    (``/models/status``, startup defer) don't break, but it no longer
    invents entitlement rows.
    """
    return 0
