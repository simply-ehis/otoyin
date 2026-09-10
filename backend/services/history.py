"""
Generation history management module.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from .. import config
from ..database import (
    Generation as DBGeneration,
    GenerationVersion as DBGenerationVersion,
    VoiceProfile as DBVoiceProfile,
)
from ..models import (
    EffectConfig,
    GenerationResponse,
    GenerationVersionResponse,
    HistoryListResponse,
    HistoryQuery,
    HistoryResponse,
)


def _get_versions_for_generation(generation_id: str, db: Session) -> tuple:
    """Get versions list and active version ID for a generation."""
    import json

    versions_rows = (
        db.query(DBGenerationVersion)
        .filter_by(generation_id=generation_id)
        .order_by(DBGenerationVersion.created_at)
        .all()
    )
    if not versions_rows:
        return None, None

    versions = []
    active_version_id = None
    for v in versions_rows:
        effects_chain = None
        if v.effects_chain:
            try:
                raw = json.loads(v.effects_chain)
                effects_chain = [EffectConfig(**e) for e in raw]
            except Exception as e:
                logging.getLogger(__name__).warning("Corrupt effects_chain JSON for version %s; ignoring: %s", v.id, e)
        versions.append(
            GenerationVersionResponse(
                id=v.id,
                generation_id=v.generation_id,
                label=v.label,
                audio_path=v.audio_path,
                effects_chain=effects_chain,
                is_default=v.is_default,
                created_at=v.created_at,
            )
        )
        if v.is_default:
            active_version_id = v.id

    return versions, active_version_id


async def create_generation(
    profile_id: str,
    text: str,
    language: str,
    audio_path: str,
    duration: float,
    seed: int | None,
    db: Session,
    instruct: str | None = None,
    generation_id: str | None = None,
    status: str = "completed",
    engine: str | None = "kokoro",
    model_size: str | None = None,
    temperature: float | None = None,
    source: str = "manual",
    use_cloud: bool = False,
    voice_clean: bool = False,
) -> GenerationResponse:
    """
    Create a new generation history entry.

    Args:
        profile_id: Profile ID used for generation
        text: Generated text
        language: Language code
        audio_path: Path where audio was saved
        duration: Audio duration in seconds
        seed: Random seed used (if any)
        db: Database session
        instruct: Natural language instruction used (if any)
        generation_id: Pre-assigned ID (for async generation flow)
        status: Generation status (generating, completed, failed)
        engine: TTS engine used (e.g. kokoro, zonos, fish_speech)
        model_size: Model size variant (only for engines with multiple sizes)
        source: Origin marker stored on the row. ``"manual"`` for regular
            /generate calls; ``"personality_speak"`` for rows created
            by the /profiles/{id}/speak endpoint. Enables filtering the
            history view for personality-driven output.

    Returns:
        Created generation entry
    """
    db_generation = DBGeneration(
        id=generation_id or str(uuid.uuid4()),
        profile_id=profile_id,
        text=text,
        language=language,
        audio_path=audio_path,
        duration=duration,
        seed=seed,
        instruct=instruct,
        engine=engine,
        model_size=model_size,
        temperature=temperature,
        status=status,
        source=source,
        use_cloud=use_cloud,
        voice_clean=voice_clean,
        created_at=datetime.now(UTC),
    )

    db.add(db_generation)
    db.commit()
    db.refresh(db_generation)

    from .telemetry import track_event

    track_event("generation_created", {"engine": engine, "source": source})

    return GenerationResponse.model_validate(db_generation)


async def update_generation_status(
    generation_id: str,
    status: str,
    db: Session,
    audio_path: str | None = None,
    duration: float | None = None,
    error: str | None = None,
) -> GenerationResponse | None:
    """Update the status of a generation (used by async generation flow)."""
    generation = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not generation:
        return None

    generation.status = status
    if audio_path is not None:
        generation.audio_path = audio_path
    if duration is not None:
        generation.duration = duration
    if error is not None:
        generation.error = error

    db.commit()
    db.refresh(generation)

    from .telemetry import track_event

    if status == "completed":
        track_event(
            "generation_completed",
            {
                "engine": generation.engine,
                "duration": generation.duration,
                "source": generation.source,
            },
        )
    elif status == "failed":
        track_event(
            "generation_failed",
            {"engine": generation.engine, "error": error, "source": generation.source},
        )

    return GenerationResponse.model_validate(generation)


async def get_generation(
    generation_id: str,
    db: Session,
) -> GenerationResponse | None:
    """
    Get a generation by ID.

    Args:
        generation_id: Generation ID
        db: Database session

    Returns:
        Generation or None if not found
    """
    generation = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not generation:
        return None

    return GenerationResponse.model_validate(generation)


async def list_generations(
    query: HistoryQuery,
    db: Session,
) -> HistoryListResponse:
    """
    List generations with optional filters.

    Args:
        query: Query parameters (filters, pagination)
        db: Database session

    Returns:
        HistoryListResponse with items and total count
    """
    # Build base query with join to get profile name
    q = db.query(DBGeneration, DBVoiceProfile.name.label("profile_name")).outerjoin(
        DBVoiceProfile, DBGeneration.profile_id == DBVoiceProfile.id
    )

    # Apply profile filter
    if query.profile_id:
        q = q.filter(DBGeneration.profile_id == query.profile_id)

    # Apply search filter (searches in text content)
    if query.search:
        search_pattern = f"%{query.search}%"
        q = q.filter(DBGeneration.text.like(search_pattern))

    # Get total count before pagination
    total_count = q.count()

    # Apply ordering (newest first)
    q = q.order_by(DBGeneration.created_at.desc())

    # Apply pagination
    q = q.offset(query.offset).limit(query.limit)

    # Execute query
    results = q.all()

    # Batch-load all versions in a single query (fixes N+1)
    import json as _json

    gen_ids = [gen.id for gen, _ in results]
    all_version_rows = (
        (
            db.query(DBGenerationVersion)
            .filter(DBGenerationVersion.generation_id.in_(gen_ids))
            .order_by(DBGenerationVersion.created_at)
            .all()
        )
        if gen_ids
        else []
    )

    # Group versions by generation_id
    versions_by_gen: dict[str, list] = {}
    active_version_by_gen: dict[str, str] = {}
    for v in all_version_rows:
        gid = v.generation_id
        if gid not in versions_by_gen:
            versions_by_gen[gid] = []
        effects_chain = None
        if v.effects_chain:
            try:
                raw = _json.loads(v.effects_chain)
                effects_chain = [EffectConfig(**e) for e in raw]
            except Exception as e:
                logging.warning("Corrupt effects_chain JSON for version %s; ignoring: %s", v.id, e)
        versions_by_gen[gid].append(
            GenerationVersionResponse(
                id=v.id,
                generation_id=v.generation_id,
                label=v.label,
                audio_path=v.audio_path,
                effects_chain=effects_chain,
                is_default=v.is_default,
                created_at=v.created_at,
            )
        )
        if v.is_default:
            active_version_by_gen[gid] = v.id

    # Convert to HistoryResponse with profile_name
    items = []
    for generation, profile_name in results:
        versions = versions_by_gen.get(generation.id)
        active_version_id = active_version_by_gen.get(generation.id)
        if versions is not None and not versions:
            versions = None
        items.append(
            HistoryResponse(
                id=generation.id,
                profile_id=generation.profile_id,
                profile_name=profile_name or "(deleted)",
                text=generation.text,
                language=generation.language,
                audio_path=generation.audio_path,
                duration=generation.duration,
                seed=generation.seed,
                instruct=generation.instruct,
                engine=generation.engine or "",
                model_size=generation.model_size,
                status=generation.status or "completed",
                error=generation.error,
                is_favorited=bool(generation.is_favorited),
                created_at=generation.created_at,
                versions=versions,
                active_version_id=active_version_id,
            )
        )

    return HistoryListResponse(
        items=items,
        total=total_count,
    )


async def delete_generation(
    generation_id: str,
    db: Session,
) -> bool:
    """
    Delete a generation.

    Args:
        generation_id: Generation ID
        db: Database session

    Returns:
        True if deleted, False if not found
    """
    generation = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not generation:
        return False

    # Delete all version files and records
    from . import versions as versions_mod

    versions_mod.delete_versions_for_generation(generation_id, db)

    # Delete main audio file (if not already removed by version cleanup)
    if generation.audio_path:
        audio_path = config.resolve_storage_path(generation.audio_path)
        if audio_path is not None and audio_path.exists():
            audio_path.unlink()

    # Delete from database
    db.delete(generation)
    db.commit()

    return True


async def delete_failed_generations(db: Session) -> int:
    """
    Delete every generation whose status is 'failed'.

    Used by the "Clear failed" action in the UI so users can tidy up
    history after the model wasn't loaded, the app was closed mid-run,
    or a generation otherwise errored out (see issue #410).

    Returns:
        Number of generations deleted.
    """

    failed = db.query(DBGeneration).filter(DBGeneration.status == "failed").all()
    if not failed:
        return 0

    failed_ids = [g.id for g in failed]

    # Batch-load all versions for failed generations (single query)
    all_versions = db.query(DBGenerationVersion).filter(DBGenerationVersion.generation_id.in_(failed_ids)).all()

    # Delete version audio files
    for v in all_versions:
        if v.audio_path:
            vpath = config.resolve_storage_path(v.audio_path)
            if vpath is not None and vpath.exists():
                try:
                    vpath.unlink()
                except OSError as e:
                    logging.debug("Could not delete version audio file %s: %s", vpath, e)

    # Delete version rows in bulk
    for v in all_versions:
        db.delete(v)

    # Delete main audio files and generation rows
    count = 0
    for generation in failed:
        if generation.audio_path:
            audio_path = config.resolve_storage_path(generation.audio_path)
            if audio_path is not None and audio_path.exists():
                try:
                    audio_path.unlink()
                except OSError as e:
                    logging.debug("Could not delete generation audio file %s: %s", audio_path, e)

        db.delete(generation)
        count += 1

    db.commit()
    return count


async def delete_generations_by_profile(profile_id: str, db: Session) -> int:
    """
    Delete every generation (and its versions/audio files) made with the given profile.

    Generation.profile_id has no DB-level cascade, so without this the rows and
    audio files are orphaned whenever a voice profile is deleted. Called from
    profiles.delete_profile() before the profile row itself is removed.

    Returns:
        Number of generations deleted.
    """

    generations = db.query(DBGeneration).filter(DBGeneration.profile_id == profile_id).all()
    if not generations:
        return 0

    generation_ids = [g.id for g in generations]

    # Batch-load all versions for these generations (single query)
    all_versions = db.query(DBGenerationVersion).filter(DBGenerationVersion.generation_id.in_(generation_ids)).all()

    # Delete version audio files
    for v in all_versions:
        if v.audio_path:
            vpath = config.resolve_storage_path(v.audio_path)
            if vpath is not None and vpath.exists():
                try:
                    vpath.unlink()
                except OSError as e:
                    logging.debug("Could not delete version audio file %s: %s", vpath, e)

    # Delete version rows in bulk
    for v in all_versions:
        db.delete(v)

    # Delete main audio files and generation rows
    count = 0
    for generation in generations:
        if generation.audio_path:
            audio_path = config.resolve_storage_path(generation.audio_path)
            if audio_path is not None and audio_path.exists():
                try:
                    audio_path.unlink()
                except OSError as e:
                    logging.debug("Could not delete generation audio file %s: %s", audio_path, e)

        db.delete(generation)
        count += 1

    db.commit()
    return count


async def get_generation_stats(db: Session) -> dict:
    """
    Get generation statistics.

    Args:
        db: Database session

    Returns:
        Statistics dictionary
    """
    from sqlalchemy import func

    total = db.query(func.count(DBGeneration.id)).scalar()

    total_duration = db.query(func.sum(DBGeneration.duration)).scalar() or 0

    # Get generations by profile
    by_profile = (
        db.query(DBGeneration.profile_id, func.count(DBGeneration.id).label("count"))
        .group_by(DBGeneration.profile_id)
        .all()
    )

    return {
        "total_generations": total,
        "total_duration_seconds": total_duration,
        "generations_by_profile": {profile_id: count for profile_id, count in by_profile},
    }
