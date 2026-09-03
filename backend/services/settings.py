"""
Server-side user settings â€” singleton rows persisted in SQLite so every
client window, API consumer, and headless flow reads the same preferences.

Two domains live here: capture/refine defaults and long-form generation
defaults. Each has a ``get_*`` that lazily creates the row with defaults and
an ``update_*`` that accepts a partial payload.
"""

from typing import Any

from sqlalchemy.orm import Session

from ..database import (
    AssistantSettings as DBAssistantSettings,
    CaptureSettings as DBCaptureSettings,
    GenerationSettings as DBGenerationSettings,
    PerformanceSettings as DBPerformanceSettings,
)
from ..utils.capture_chords import (
    default_push_to_talk_chord,
    default_toggle_to_talk_chord,
)

SINGLETON_ID = 1


def _get_or_create_capture_row(db: Session) -> DBCaptureSettings:
    row = db.query(DBCaptureSettings).filter(DBCaptureSettings.id == SINGLETON_ID).first()
    if row is None:
        row = DBCaptureSettings(
            id=SINGLETON_ID,
            chord_push_to_talk_keys=default_push_to_talk_chord(),
            chord_toggle_to_talk_keys=default_toggle_to_talk_chord(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _get_or_create_generation_row(db: Session) -> DBGenerationSettings:
    row = db.query(DBGenerationSettings).filter(DBGenerationSettings.id == SINGLETON_ID).first()
    if row is None:
        row = DBGenerationSettings(id=SINGLETON_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _apply_patch(row: Any, patch: dict[str, Any]) -> None:
    """Apply a partial update to a settings row.

    Values explicitly set to ``None`` are honored only for columns where the
    schema allows it â€” clearing ``default_playback_voice_id`` works, but a
    ``None`` for a non-nullable field is dropped rather than crashing the
    request. Unknown keys are ignored.
    """
    columns = type(row).__table__.columns
    for key, value in patch.items():
        col = columns.get(key)
        if col is None:
            continue
        if value is None and not col.nullable:
            continue
        setattr(row, key, value)


def get_capture_settings(db: Session) -> DBCaptureSettings:
    """Return the capture settings row, creating it with defaults if missing."""
    return _get_or_create_capture_row(db)


def update_capture_settings(db: Session, patch: dict[str, Any]) -> DBCaptureSettings:
    row = _get_or_create_capture_row(db)
    _apply_patch(row, patch)
    db.commit()
    db.refresh(row)
    return row


def get_generation_settings(db: Session) -> DBGenerationSettings:
    """Return the generation settings row, creating it with defaults if missing."""
    return _get_or_create_generation_row(db)


def update_generation_settings(db: Session, patch: dict[str, Any]) -> DBGenerationSettings:
    row = _get_or_create_generation_row(db)
    _apply_patch(row, patch)
    db.commit()
    db.refresh(row)
    return row


def _get_or_create_assistant_row(db: Session) -> DBAssistantSettings:
    row = db.query(DBAssistantSettings).filter(DBAssistantSettings.id == SINGLETON_ID).first()
    if row is None:
        row = DBAssistantSettings(id=SINGLETON_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_assistant_settings(db: Session) -> DBAssistantSettings:
    """Return the assistant settings row, creating it with defaults if missing."""
    return _get_or_create_assistant_row(db)


def update_assistant_settings(db: Session, patch: dict[str, Any]) -> DBAssistantSettings:
    row = _get_or_create_assistant_row(db)
    _apply_patch(row, patch)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Performance mode (speed vs memory)
# ---------------------------------------------------------------------------


def _get_or_create_performance_row(db: Session) -> DBPerformanceSettings:
    row = db.query(DBPerformanceSettings).filter(DBPerformanceSettings.id == SINGLETON_ID).first()
    if row is None:
        row = DBPerformanceSettings(id=SINGLETON_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    # Normalize legacy NULL/string JSON that can appear after the per_engine column migration
    raw = getattr(row, "per_engine_keepalive", None)
    needs_commit = False
    if raw is None:
        row.per_engine_keepalive = {}
        needs_commit = True
    elif isinstance(raw, str):
        import json as _json

        try:
            row.per_engine_keepalive = _json.loads(raw) if raw else {}
        except Exception:
            row.per_engine_keepalive = {}
        needs_commit = True
    if needs_commit:
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
    return row


def get_performance_settings(db: Session) -> DBPerformanceSettings:
    """Return the performance settings row, creating it with defaults if missing."""
    return _get_or_create_performance_row(db)


def update_performance_settings(db: Session, patch: dict[str, Any]) -> DBPerformanceSettings:
    row = _get_or_create_performance_row(db)
    # Merge per_engine_keepalive shallowly so toggling one engine doesn't wipe others.
    if "per_engine_keepalive" in patch and isinstance(patch["per_engine_keepalive"], dict):
        existing = getattr(row, "per_engine_keepalive", None) or {}
        if isinstance(existing, str):
            import json as _json

            try:
                existing = _json.loads(existing)
            except Exception:
                existing = {}
        if not isinstance(existing, dict):
            existing = {}
        merged = dict(existing)
        merged.update(patch["per_engine_keepalive"])
        # Drop explicit None values to allow clearing a single engine override.
        merged = {k: v for k, v in merged.items() if v is not None}
        patch = {**patch, "per_engine_keepalive": merged}
    _apply_patch(row, patch)
    db.commit()
    db.refresh(row)
    return row


def get_performance_mode() -> bool:
    """Whether the app should prioritize speed over memory.

    Reads the singleton performance row; defaults to ``False`` (balanced / RAM
    conscious) when unset. Consumed by the model lifecycle manager to disable
    idle-unload, and by the frontend to skip list virtualization.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_performance_row(db)
        return bool(row.performance_mode)
    finally:
        db.close()


def get_per_engine_keepalive() -> dict[str, bool]:
    """Return the per-engine keepalive overrides dict.

    Empty dict means every engine follows the global ``performance_mode``.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_performance_row(db)
        raw = getattr(row, "per_engine_keepalive", None) or {}
        if isinstance(raw, str):
            import json as _json

            try:
                raw = _json.loads(raw)
            except Exception:
                raw = {}
        if not isinstance(raw, dict):
            return {}
        # Coerce values to bool and keys to str
        return {str(k): bool(v) for k, v in raw.items() if v is not None}
    finally:
        db.close()


def is_engine_keepalive(engine: str) -> bool:
    """Whether ``engine`` should stay resident (skip idle-unload).

    Checks ``per_engine_keepalive.get(engine, global_mode)`` — a per-engine
    True keeps that engine resident even when the global performance mode is
    off, and a per-engine False can opt a single engine out when global is
    on.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_performance_row(db)
        raw = getattr(row, "per_engine_keepalive", None) or {}
        if isinstance(raw, str):
            import json as _json

            try:
                raw = _json.loads(raw)
            except Exception:
                raw = {}
        if not isinstance(raw, dict):
            raw = {}
        global_mode = bool(row.performance_mode)
        if engine in raw and raw[engine] is not None:
            return bool(raw[engine])
        return global_mode
    finally:
        db.close()


def compute_effective_tokens(model_size: str, context_override, max_override):
    """Resolve the effective n_ctx / max_tokens for a model.

    When the user has not set an override (``None``), fall back to the
    RAM-aware default from ``utils.llm_context``. The override always wins.
    """
    from ..utils.llm_context import compute_llm_context

    n_ctx = compute_llm_context(model_size, override=context_override)
    if max_override is not None:
        gen_tokens = compute_llm_context(model_size, override=max_override)
    else:
        gen_tokens = n_ctx
    return n_ctx, gen_tokens


def get_assistant_token_settings() -> tuple[int, int, str]:
    """Standalone read of assistant token settings for the LLM load path.

    Opens its own session (the streaming call sites have no ``db``). Returns
    ``(n_ctx, max_tokens, model_size)`` with RAM-aware defaults applied.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_assistant_row(db)
        n_ctx, gen_tokens = compute_effective_tokens(row.model_size, row.context_tokens, row.max_tokens)
        return n_ctx, gen_tokens, row.model_size
    finally:
        db.close()


def get_assistant_token_settings_for(model_size: str) -> tuple[int, int]:
    """Like ``get_assistant_token_settings`` but pinned to a specific model.

    The chat request may ask for a model size that differs from the stored
    default, so the RAM-aware default and any user override are resolved
    against the model actually being loaded. Returns ``(n_ctx, max_tokens)``.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_assistant_row(db)
        return compute_effective_tokens(model_size, row.context_tokens, row.max_tokens)
    finally:
        db.close()


def get_budget_max_tokens(model_size: str) -> int:
    """Effective generation ``max_tokens`` for a model, from settings + RAM.

    Used by non-chat LLM callers (personality, refinement) so their output
    length scales with the machine instead of a hardcoded constant.
    """
    _, gen_tokens = get_assistant_token_settings_for(model_size)
    return gen_tokens


def get_assistant_thinking_enabled() -> bool:
    """Whether the planner should emit chain-of-thought reasoning.

    Reads the singleton assistant row; defaults to ``False`` (reasoning stays
    silent) when unset. The value gates whether the ``<think>`` stream event is
    surfaced to the frontend.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_assistant_row(db)
        return bool(row.thinking_enabled)
    finally:
        db.close()


def get_assistant_system_prompt() -> str | None:
    """User-edited base system prompt for the assistant, or ``None`` to use the
    built-in default from ``agents/manifest``.

    A non-empty value overrides the canonical base prompt; the tool-call schema
    and router hints are still appended on top for the local planner path.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_assistant_row(db)
        prompt = row.system_prompt
        return prompt.strip() if prompt else None
    finally:
        db.close()


def get_assistant_kv_quant() -> str:
    """KV-cache quantization for the GGUF planner (e.g. ``q8_0``, ``f16``).

    Reads the singleton assistant row; defaults to ``q8_0`` (halves KV RAM vs
    f16) when unset.
    """
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        row = _get_or_create_assistant_row(db)
        return row.kv_quant or "q8_0"
    finally:
        db.close()
