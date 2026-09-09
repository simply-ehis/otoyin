"""
Startup stale-state detection and cleanup.

Runs once at server boot (called from _run_startup) to purge:
  1. Leftover .keep-running sentinel files from crashed sessions
  2. Orphaned generation records (audio file deleted but DB row remains)
  3. Orphaned GenerationVersion rows (parent generation deleted)
  4. Orphaned StoryItem rows (generation or story deleted)
  5. Stale autosave snapshots (session deleted but snapshots remain)
  6. Orphaned profile sample rows (audio file deleted)
  7. Orphaned chunk/processed audio files (generation record deleted)
  8. Stale ModelDownload rows (local file no longer on disk)
"""

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# Maximum orphaned audio files to delete per startup run (safety cap).
_MAX_FILE_DELETIONS = 500


def purge_stale_state(db, data_dir: Path) -> dict[str, int]:
    """Run all stale-state purges and return a summary of actions taken.

    Args:
        db: SQLAlchemy session (already opened).
        data_dir: The configured data directory.

    Returns:
        Dict mapping cleanup category to number of items purged.
    """
    summary: dict[str, int] = {}

    summary["sentinels"] = _purge_stale_sentinels(data_dir)
    summary["stale_generations"] = _purge_stale_generations(db)
    summary["orphaned_versions"] = _purge_orphaned_generation_versions(db)
    summary["orphaned_story_items"] = _purge_orphaned_story_items(db)
    summary["stale_autosaves"] = _purge_stale_autosave_snapshots(db)
    summary["orphaned_samples"] = _purge_orphaned_profile_samples(db)
    summary["orphaned_files"] = _purge_orphaned_audio_files(db, data_dir)
    summary["stale_downloads"] = _purge_stale_model_downloads(db)
    summary["orphaned_adr_takes"] = _purge_orphaned_adr_takes(db)
    summary["orphaned_conv_messages"] = _purge_orphaned_conversation_messages(db)
    summary["orphaned_agent_memory"] = _purge_orphaned_agent_memory(db)
    summary["orphaned_entitlements"] = _purge_orphaned_entitlements(db)

    # DB size cap — prevent unbounded SQLite growth by pruning old completed
    # generations when the file exceeds the threshold.
    summary["db_pruned"] = _enforce_db_size_cap(db, data_dir)

    total = sum(summary.values())
    if total > 0:
        items = ", ".join(f"{k}={v}" for k, v in summary.items() if v > 0)
        logger.info("Startup cleanup: purged %d items [%s]", total, items)
    else:
        logger.debug("Startup cleanup: no stale state found")

    return summary


# ---------------------------------------------------------------------------
# 1. Sentinel files
# ---------------------------------------------------------------------------


def _purge_stale_sentinels(data_dir: Path) -> int:
    """Remove leftover .keep-running sentinel files from previous sessions."""
    count = 0
    for name in (".keep-running", ".keep-running.old"):
        sentinel = data_dir / name
        if sentinel.exists():
            try:
                sentinel.unlink()
                count += 1
                logger.info("Removed stale sentinel: %s", sentinel.name)
            except OSError as e:
                logger.warning("Failed to remove sentinel %s: %s", sentinel, e)
    return count


# ---------------------------------------------------------------------------
# 2. Stale generation records (generating/loading_model left over from crash)
# ---------------------------------------------------------------------------


def _purge_stale_generations(db) -> int:
    """Mark generation records stuck in transient states as failed.

    These are leftovers from a server crash or force-kill mid-generation.
    """
    from sqlalchemy import text as sa_text

    result = db.execute(
        sa_text(
            "UPDATE generations SET status = 'failed', "
            "error = 'Server was shut down during generation' "
            "WHERE status IN ('generating', 'loading_model')"
        )
    )
    return result.rowcount


# ---------------------------------------------------------------------------
# 3. Orphaned GenerationVersion rows
# ---------------------------------------------------------------------------


def _purge_orphaned_generation_versions(db) -> int:
    """Delete GenerationVersion rows whose parent generation no longer exists."""
    from sqlalchemy import text as sa_text

    result = db.execute(
        sa_text("DELETE FROM generation_versions WHERE generation_id NOT IN (SELECT id FROM generations)")
    )
    return result.rowcount


# ---------------------------------------------------------------------------
# 4. Orphaned StoryItem rows
# ---------------------------------------------------------------------------


def _purge_orphaned_story_items(db) -> int:
    """Delete StoryItem rows whose parent story or generation was deleted."""
    from sqlalchemy import text as sa_text

    # Delete items whose story was deleted
    r1 = db.execute(sa_text("DELETE FROM story_items WHERE story_id NOT IN (SELECT id FROM stories)"))
    # Delete items whose generation was deleted
    r2 = db.execute(sa_text("DELETE FROM story_items WHERE generation_id NOT IN (SELECT id FROM generations)"))
    return r1.rowcount + r2.rowcount


# ---------------------------------------------------------------------------
# 5. Stale autosave snapshots
# ---------------------------------------------------------------------------


def _purge_stale_autosave_snapshots(db) -> int:
    """Delete autosave snapshots whose parent session no longer exists."""
    import re

    from sqlalchemy import text as sa_text

    _ident_re = re.compile(r"^[a-z_][a-z0-9_]*$")

    count = 0
    for table, session_col in (("session_autosave_snapshots", "session_id"),):
        if not _ident_re.match(table) or not _ident_re.match(session_col):
            raise ValueError(f"Invalid identifier: table={table!r} col={session_col!r}")
        result = db.execute(
            sa_text(
                f"DELETE FROM {table} "
                f"WHERE {session_col} NOT IN ("
                f"  SELECT id FROM audio_studio_sessions UNION "
                f"  SELECT id FROM comping_sessions UNION "
                f"  SELECT id FROM mixer_sessions"
                f")"
            )
        )
        count += result.rowcount
    return count


# ---------------------------------------------------------------------------
# 6. Orphaned profile samples
# ---------------------------------------------------------------------------


def _purge_orphaned_profile_samples(db) -> int:
    """Delete ProfileSample rows whose parent profile was deleted."""
    from sqlalchemy import text as sa_text

    result = db.execute(sa_text("DELETE FROM profile_samples WHERE profile_id NOT IN (SELECT id FROM profiles)"))
    return result.rowcount


# ---------------------------------------------------------------------------
# 7. Orphaned audio files on disk
# ---------------------------------------------------------------------------


def _purge_orphaned_audio_files(db, data_dir: Path) -> int:
    """Remove audio files in the generations dir that have no DB record.

    Catches chunk files ({id}_chunk_*.wav), processed files
    ({id}_processed.wav), and variant files ({id}_{suffix}.wav) left behind
    when a generation record was deleted but its audio wasn't cleaned up.
    """
    from sqlalchemy import text as sa_text

    gen_dir = data_dir / "generations"
    if not gen_dir.is_dir():
        return 0

    # Build set of known generation IDs from DB
    rows = db.execute(sa_text("SELECT id FROM generations")).fetchall()
    known_ids = {row[0] for row in rows}

    # Also collect IDs referenced by GenerationVersion records (they store
    # audio paths that should be preserved).
    version_rows = db.execute(sa_text("SELECT audio_path FROM generation_versions")).fetchall()
    known_audio_paths: set[str] = set()
    for row in version_rows:
        if row[0]:
            # audio_path is stored as relative; resolve against gen_dir
            known_audio_paths.add(str(gen_dir / row[0]))

    count = 0
    # Pattern: {uuid}.wav, {uuid}_chunk_N.wav, {uuid}_processed.wav, etc.
    audio_re = re.compile(
        r"^([0-9a-f-]{36})(?:_(?:chunk_\d+|processed|clean|[a-z_]+))?\.(?:wav|mp3|ogg)$",
        re.IGNORECASE,
    )

    for entry in gen_dir.iterdir():
        if not entry.is_file():
            continue
        if count >= _MAX_FILE_DELETIONS:
            logger.warning(
                "Startup cleanup: hit file deletion cap (%d), skipping remaining",
                _MAX_FILE_DELETIONS,
            )
            break

        m = audio_re.match(entry.name)
        if not m:
            continue

        gen_id = m.group(1)
        # Keep the file if: generation exists, or it's referenced by a version
        if gen_id in known_ids:
            continue
        if str(entry) in known_audio_paths:
            continue

        try:
            entry.unlink()
            count += 1
        except OSError as e:
            logger.debug("Could not remove orphaned audio %s: %s", entry, e)

    return count


# ---------------------------------------------------------------------------
# 8. Stale ModelDownload rows
# ---------------------------------------------------------------------------


def _purge_stale_model_downloads(db) -> int:
    """Delete ModelDownload rows whose local_path no longer exists on disk.

    Also marks downloads as stale if the HF cache blob is missing.
    """
    from sqlalchemy import text as sa_text

    rows = db.execute(sa_text("SELECT id, local_path, hf_repo_id FROM model_downloads")).fetchall()

    stale_ids: list[str] = []
    for row in rows:
        row_id, local_path, hf_repo_id = row[0], row[1], row[2]
        if local_path and not Path(local_path).exists():
            stale_ids.append(row_id)
            continue
        # If no local_path, check if the HF cache exists
        if hf_repo_id and not local_path:
            try:
                from huggingface_hub import constants as hf_constants

                repo_cache = Path(hf_constants.HF_HUB_CACHE) / ("models--" + hf_repo_id.replace("/", "--"))
                if not repo_cache.exists():
                    stale_ids.append(row_id)
            except Exception:
                logger.debug("Cache existence check failed for row %s", row_id, exc_info=True)

    if stale_ids:
        # SQLAlchemy 2.x requires named parameters for IN clauses
        bind_params = {f"id{i}": sid for i, sid in enumerate(stale_ids)}
        placeholders = ",".join(f":id{i}" for i in range(len(stale_ids)))
        db.execute(
            sa_text(f"DELETE FROM model_downloads WHERE id IN ({placeholders})"),
            bind_params,
        )
    return len(stale_ids)


# ---------------------------------------------------------------------------
# 9. Orphaned ADR takes
# ---------------------------------------------------------------------------


def _purge_orphaned_adr_takes(db) -> int:
    """Delete ADR take/line rows whose parent was deleted."""
    from sqlalchemy import text as sa_text

    # Takes referencing deleted lines
    r1 = db.execute(sa_text("DELETE FROM adr_takes WHERE line_id NOT IN (SELECT id FROM adr_lines)"))
    # Lines referencing deleted sessions
    r2 = db.execute(sa_text("DELETE FROM adr_lines WHERE session_id NOT IN (SELECT id FROM adr_sessions)"))
    return r1.rowcount + r2.rowcount


# ---------------------------------------------------------------------------
# 10. Orphaned conversation messages
# ---------------------------------------------------------------------------


def _purge_orphaned_conversation_messages(db) -> int:
    """Delete conversation messages whose parent conversation was deleted."""
    from sqlalchemy import text as sa_text

    result = db.execute(
        sa_text("DELETE FROM conversation_messages WHERE conversation_id NOT IN (SELECT id FROM conversations)")
    )
    return result.rowcount


# ---------------------------------------------------------------------------
# 11. Orphaned agent memory
# ---------------------------------------------------------------------------


def _purge_orphaned_agent_memory(db) -> int:
    """Delete agent memory rows whose source conversation was deleted."""
    from sqlalchemy import text as sa_text

    result = db.execute(
        sa_text(
            "DELETE FROM agent_memory "
            "WHERE source_conversation_id IS NOT NULL "
            "AND source_conversation_id NOT IN (SELECT id FROM conversations)"
        )
    )
    return result.rowcount


# ---------------------------------------------------------------------------
# 12. Orphaned entitlements
# ---------------------------------------------------------------------------


def _purge_orphaned_entitlements(db) -> int:
    """Delete entitlement rows whose parent license was deleted."""
    from sqlalchemy import text as sa_text

    result = db.execute(sa_text("DELETE FROM entitlements WHERE license_id NOT IN (SELECT id FROM licenses)"))
    return result.rowcount


# ---------------------------------------------------------------------------
# 13. DB size cap
# ---------------------------------------------------------------------------

# 500 MB — generous enough for heavy users, small enough to prevent bloat.
_DB_SIZE_CAP_BYTES = 500 * 1024 * 1024
# Stop pruning once we've freed this much (avoids nuking the whole history).
_DB_PRUNE_TARGET_BYTES = 100 * 1024 * 1024


def _enforce_db_size_cap(db, data_dir: Path) -> int:
    """If the SQLite file exceeds _DB_SIZE_CAP_BYTES, delete the oldest
    completed generations (and their audio files) until we've freed
    _DB_PRUNE_TARGET_BYTES or the file is under the cap.

    Returns the number of generations pruned.
    """
    from sqlalchemy import text as sa_text

    db_path = data_dir / "otoyin.db"
    if not db_path.exists():
        return 0

    file_size = db_path.stat().st_size
    if file_size <= _DB_SIZE_CAP_BYTES:
        return 0

    logger.info(
        "DB size cap exceeded: %.1f MB > %.1f MB — pruning oldest completed generations",
        file_size / (1024 * 1024),
        _DB_SIZE_CAP_BYTES / (1024 * 1024),
    )

    # Find oldest completed generations (not favorited, not actively referenced).
    rows = db.execute(
        sa_text(
            "SELECT id, audio_path FROM generations "
            "WHERE status = 'completed' AND is_favorited = 0 "
            "ORDER BY created_at ASC LIMIT 100"
        )
    ).fetchall()

    pruned = 0
    freed = 0
    for gen_id, audio_path in rows:
        if freed >= _DB_PRUNE_TARGET_BYTES:
            break
        # Delete the audio file if it exists.
        if audio_path:
            try:
                p = Path(audio_path)
                if p.exists():
                    freed += p.stat().st_size
                    p.unlink(missing_ok=True)
            except OSError:
                pass
        # Delete the generation row (cascades to versions).
        db.execute(sa_text("DELETE FROM generation_versions WHERE generation_id = :id"), {"id": gen_id})
        db.execute(sa_text("DELETE FROM generations WHERE id = :id"), {"id": gen_id})
        pruned += 1

    if pruned > 0:
        db.commit()
        logger.info("DB size cap: pruned %d generations, freed ~%.1f MB", pruned, freed / (1024 * 1024))

    return pruned
