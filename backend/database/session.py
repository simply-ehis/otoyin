"""Engine creation, initialization, and session management."""

import logging
import uuid

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

try:
    from .. import config
except ImportError:
    import config
from .migrations import run_migrations
from .models import (
    AudioChannel,
    Base,
    EffectPreset,
    Generation,
    GenerationVersion,
    ProfileChannelMapping,
    VoiceProfile,
)
from .seed import backfill_generation_versions, seed_builtin_presets

logger = logging.getLogger(__name__)

# Initialized by init_db()
engine = None
SessionLocal = None
_db_path = None


def init_db() -> None:
    """Initialize the database engine, run migrations, create tables, and seed data."""
    global engine, SessionLocal, _db_path

    _db_path = config.get_db_path()
    _db_path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        f"sqlite:///{_db_path}",
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )

    # --- SQLite performance PRAGMAs ---------------------------------------
    # WAL mode allows concurrent readers while a writer holds the lock,
    # eliminating the lock contention that the task_queue _force_fail_if_active
    # recovery path was written to handle.  busy_timeout gives writers up to
    # 5 seconds to wait for the lock instead of failing immediately.
    #
    # These are set via the engine-level "connect" event so every new
    # connection gets them automatically — no raw sqlite3 import needed.
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")  # safe with WAL
        cursor.close()

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Ensure PRAGMAs are set on the first connection before migrations run.
    # The "connect" event fires on first checkout, but pool_pre_ping can
    # create a connection before the event is registered. Force it here.
    with engine.connect():
        pass  # triggers the "connect" event, setting PRAGMAs

    run_migrations(engine)
    Base.metadata.create_all(bind=engine)
    _create_missing_indexes(engine)

    # Create default audio channel if it doesn't exist
    db = SessionLocal()
    try:
        default_channel = db.query(AudioChannel).filter(AudioChannel.is_default).first()
        if not default_channel:
            default_channel = AudioChannel(
                id=str(uuid.uuid4()),
                name="Default",
                is_default=True,
            )
            db.add(default_channel)

            for profile in db.query(VoiceProfile).all():
                db.add(
                    ProfileChannelMapping(
                        profile_id=profile.id,
                        channel_id=default_channel.id,
                    )
                )
            db.commit()
    finally:
        db.close()

    backfill_generation_versions(SessionLocal, Generation, GenerationVersion)
    seed_builtin_presets(SessionLocal, EffectPreset)


def _create_missing_indexes(engine) -> None:
    """Create performance indexes on existing tables (idempotent).

    ``Base.metadata.create_all`` only adds indexes when it creates the *table*;
    pre-existing installs never get them. This adds the hot-path indexes for
    profile_samples and story_items that later schema versions declare.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    wanted = {
        "profile_samples": [
            (
                "ix_profile_samples_profile_id",
                "CREATE INDEX IF NOT EXISTS ix_profile_samples_profile_id ON profile_samples (profile_id)",
            )
        ],
        "story_items": [
            ("ix_story_items_story_id", "CREATE INDEX IF NOT EXISTS ix_story_items_story_id ON story_items (story_id)"),
            (
                "ix_story_items_generation_id",
                "CREATE INDEX IF NOT EXISTS ix_story_items_generation_id ON story_items (generation_id)",
            ),
            (
                "ix_story_items_story_track",
                "CREATE INDEX IF NOT EXISTS ix_story_items_story_track ON story_items (story_id, track)",
            ),
        ],
    }
    for table, indexes in wanted.items():
        if table not in set(inspector.get_table_names()):
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        with engine.connect() as conn:
            for name, ddl in indexes:
                if name not in existing:
                    conn.execute(text(ddl))
                    logger.info("Created index %s on %s", name, table)
            conn.commit()


def get_db():
    """Yield a database session (FastAPI dependency)."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() before using get_db()")
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
