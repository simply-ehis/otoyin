"""DB-backed 'always-on' keepalive preference.

Engines flagged always-on are skipped by the idle-unload scheduler
(``utils/model_lifecycle``), so they stay resident across queries instead of
being released after ``IDLE_TIMEOUT_SECONDS`` of inactivity.

The set is persisted in the ``app_settings`` key/value table so the preference
survives restarts and is not editable from the generated client schema — it's a
SQL row, not user-facing JSON.

A hard-coded default set (the planner LLM) is always kept resident; user toggles
only ever add engines on top of that default.
"""

from __future__ import annotations

import logging

from ..database.models import AppSetting

logger = logging.getLogger(__name__)

# Test seam + production fallback: None until init_db() runs (this module is
# imported earlier, at route registration). Tests monkeypatch it directly.
SessionLocal = None


def _open_db():
    """Open a session, or return None when the DB isn't initialized yet."""
    factory = globals().get("SessionLocal")
    if factory is None:
        from ..database import session as _db_session

        factory = _db_session.SessionLocal
    return factory() if factory is not None else None


# Engines kept resident regardless of user toggles (e.g. the local planner LLM
# so the assistant responds without a cold-start).
DEFAULT_ALWAYS_ON = frozenset({"gguf_llm"})
_KEY = "always_on_engines"


def _load_user_set(db) -> set[str]:
    row = db.get(AppSetting, _KEY)
    if row is None or not row.value_json:
        return set()
    engines = row.value_json.get("engines", [])
    return {str(e) for e in engines} if isinstance(engines, list) else set()


def get_always_on_engines() -> set[str]:
    """Union of default always-on engines and any user-toggled ones."""
    # No DB yet (pre-startup): only the default always-on set exists — no
    # user toggles can have been persisted before the server is ready.
    db = _open_db()
    if db is None:
        return set(DEFAULT_ALWAYS_ON)
    try:
        return DEFAULT_ALWAYS_ON | _load_user_set(db)
    finally:
        db.close()


def is_engine_always_on(engine: str) -> bool:
    """True if ``engine`` should be kept resident by the lifecycle manager."""
    return engine in get_always_on_engines()


def set_engine_always_on(engine: str, always_on: bool) -> set[str]:
    """Toggle a single engine's always-on flag (persisted to ``app_settings``).

    Default engines (the planner LLM) cannot be disabled by the user — they are
    always kept resident. Non-default engines can be freely toggled.
    Returns the resulting effective always-on set.
    """
    if engine in DEFAULT_ALWAYS_ON:
        if not always_on:
            logger.info("always-on: ignoring disable attempt for default engine '%s'", engine)
        return get_always_on_engines()

    db = _open_db()
    if db is None:
        return get_always_on_engines()
    try:
        user_set = _load_user_set(db)
        if always_on:
            user_set.add(engine)
        else:
            user_set.discard(engine)
        row = db.get(AppSetting, _KEY)
        if row is None:
            row = AppSetting(key=_KEY, value_json={"engines": list(user_set)})
            db.add(row)
        else:
            row.value_json = {"engines": list(user_set)}
        db.commit()
        logger.info("always-on: %s -> %s", "on" if always_on else "off", engine)
    finally:
        db.close()

    return DEFAULT_ALWAYS_ON | user_set
