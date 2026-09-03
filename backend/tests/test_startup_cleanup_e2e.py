"""E2E test: start the server, seed stale state, verify purge_stale_state cleans it up.

Uses the FastAPI TestClient (no real server process) to hit the /health endpoint
and trigger the startup lifecycle, then directly calls purge_stale_state with
the same DB session the server uses, verifying the full integration path:
  server startup → stale state exists → purge → stale state gone.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture
def client():
    """Create a FastAPI test client with readiness bypassed."""
    from starlette.testclient import TestClient

    from backend.app import _init_ready_event, _signal_ready, create_app

    _init_ready_event()
    _signal_ready()

    app = create_app()
    client = TestClient(app, raise_server_exceptions=False)
    return client


@pytest.fixture
def db_session(client):
    """Create an in-memory SQLite database with all tables for purge tests.

    Uses the same Base.metadata as the app so all tables exist, but a
    separate engine so we don't touch the app's real database.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def data_dir():
    """Get the app's configured data directory."""
    from backend import config

    return config.get_data_dir()


class TestStartupCleanupE2E:
    """E2E tests that verify purge_stale_state works through the full server lifecycle."""

    def test_server_starts_and_health_responds(self, client):
        """Baseline: server starts and /health responds."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data

    def test_purge_stale_state_cleans_sentinels(self, client, db_session, data_dir):
        """Seed .keep-running sentinels, call purge, verify they're removed."""
        from backend.utils.startup_cleanup import purge_stale_state

        # Seed stale state
        sentinel = data_dir / ".keep-running"
        sentinel.write_text("test-pid")
        assert sentinel.exists()

        # Run cleanup
        result = purge_stale_state(db_session, data_dir)

        # Verify sentinel was removed
        assert result["sentinels"] >= 1
        assert not sentinel.exists()

    def test_purge_stale_state_cleans_generating_records(self, client, db_session, data_dir):
        """Seed stale 'generating' records, call purge, verify they're marked failed."""
        from backend.database.models import Generation
        from backend.utils.startup_cleanup import purge_stale_state

        # Create stale generation records
        stale_ids = []
        for _ in range(3):
            gen = Generation(
                id=str(uuid.uuid4()),
                profile_id=str(uuid.uuid4()),
                text="stale generation",
                status="generating",
            )
            db_session.add(gen)
            stale_ids.append(gen.id)
        db_session.flush()

        # Also create one completed generation (should survive)
        good_gen = Generation(
            id=str(uuid.uuid4()),
            profile_id=str(uuid.uuid4()),
            text="good generation",
            status="completed",
        )
        db_session.add(good_gen)
        db_session.flush()

        # Run cleanup
        result = purge_stale_state(db_session, data_dir)

        # Verify stale ones were marked failed
        assert result["stale_generations"] == 3

        # Verify good one survived
        db_session.refresh(good_gen)
        assert good_gen.status == "completed"

    def test_purge_stale_state_cleans_orphaned_versions(self, client, db_session, data_dir):
        """Seed orphaned GenerationVersion rows, call purge, verify cleanup."""
        from backend.database.models import GenerationVersion
        from backend.utils.startup_cleanup import purge_stale_state

        # Create orphaned version (parent generation doesn't exist)
        ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id="nonexistent-parent-id",
            label="orphan",
            audio_path="orphan.wav",
        )
        db_session.add(ver)
        db_session.flush()

        # Run cleanup
        result = purge_stale_state(db_session, data_dir)

        assert result["orphaned_versions"] == 1
        assert db_session.query(GenerationVersion).count() == 0

    def test_purge_stale_state_cleans_orphaned_audio_files(self, client, db_session, data_dir):
        """Seed orphaned audio files, call purge, verify they're deleted."""
        from backend.utils.startup_cleanup import purge_stale_state

        gen_dir = data_dir / "generations"
        gen_dir.mkdir(exist_ok=True)

        # Create orphaned audio files (no matching generation in DB)
        orphan_id = str(uuid.uuid4())
        orphan_files = [
            gen_dir / f"{orphan_id}.wav",
            gen_dir / f"{orphan_id}_chunk_0.wav",
            gen_dir / f"{orphan_id}_processed.wav",
        ]
        for f in orphan_files:
            f.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")

        # Run cleanup
        result = purge_stale_state(db_session, data_dir)

        assert result["orphaned_files"] == 3
        for f in orphan_files:
            assert not f.exists()

    def test_purge_preserves_valid_data(self, client, db_session, data_dir):
        """Verify purge doesn't touch valid, non-stale data."""
        from backend.database.models import Generation, GenerationVersion
        from backend.utils.startup_cleanup import purge_stale_state

        # Create valid generation
        gen = Generation(
            id=str(uuid.uuid4()),
            profile_id=str(uuid.uuid4()),
            text="valid generation",
            status="completed",
            audio_path="valid.wav",
        )
        db_session.add(gen)
        db_session.flush()

        # Create valid version referencing valid generation
        ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id=gen.id,
            label="original",
            audio_path="valid.wav",
        )
        db_session.add(ver)
        db_session.flush()

        # Create valid audio file
        gen_dir = data_dir / "generations"
        gen_dir.mkdir(exist_ok=True)
        audio = gen_dir / f"{gen.id}.wav"
        audio.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")

        # Run cleanup
        result = purge_stale_state(db_session, data_dir)

        # Everything should survive
        assert result["stale_generations"] == 0
        assert result["orphaned_versions"] == 0
        assert result["orphaned_files"] == 0

        db_session.refresh(gen)
        assert gen.status == "completed"
        assert db_session.query(GenerationVersion).count() == 1
        assert audio.exists()

    def test_purge_mixed_stale_and_clean(self, client, db_session, data_dir):
        """Seed a mix of stale and clean data, verify only stale is purged."""
        from backend.database.models import (
            Generation,
            GenerationVersion,
            ProfileSample,
            VoiceProfile,
        )
        from backend.utils.startup_cleanup import purge_stale_state

        # Clean data
        profile = VoiceProfile(id=str(uuid.uuid4()), name="clean-profile")
        db_session.add(profile)
        db_session.flush()

        sample = ProfileSample(
            id=str(uuid.uuid4()),
            profile_id=profile.id,
            audio_path="sample.wav",
            reference_text="hello",
        )
        db_session.add(sample)
        db_session.flush()

        good_gen = Generation(
            id=str(uuid.uuid4()),
            profile_id=str(uuid.uuid4()),
            text="good",
            status="completed",
        )
        db_session.add(good_gen)
        db_session.flush()

        # Stale data
        stale_gen = Generation(
            id=str(uuid.uuid4()),
            profile_id=str(uuid.uuid4()),
            text="stale",
            status="generating",
        )
        db_session.add(stale_gen)
        db_session.flush()

        orphan_ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id="deleted-id",
            label="orphan",
            audio_path="orphan.wav",
        )
        db_session.add(orphan_ver)
        db_session.flush()

        orphan_sample = ProfileSample(
            id=str(uuid.uuid4()),
            profile_id="deleted-profile",
            audio_path="orphan.wav",
            reference_text="orphan",
        )
        db_session.add(orphan_sample)
        db_session.flush()

        # Seed sentinels
        sentinel = data_dir / ".keep-running"
        sentinel.write_text("stale")

        # Run cleanup
        result = purge_stale_state(db_session, data_dir)

        # Stale items purged
        assert result["stale_generations"] == 1
        assert result["orphaned_versions"] == 1
        assert result["orphaned_samples"] == 1
        assert result["sentinels"] == 1

        # Clean items survived
        db_session.refresh(good_gen)
        assert good_gen.status == "completed"
        assert db_session.query(Generation).count() == 2  # good + stale (marked failed)
        assert db_session.query(GenerationVersion).count() == 0
        assert db_session.query(ProfileSample).filter(ProfileSample.profile_id == profile.id).count() == 1

    def test_purge_is_idempotent(self, client, db_session, data_dir):
        """Running purge twice should not error and should return zeros second time."""
        from backend.database.models import Generation
        from backend.utils.startup_cleanup import purge_stale_state

        # Seed some stale state
        sentinel = data_dir / ".keep-running"
        sentinel.write_text("test")
        gen = Generation(
            id=str(uuid.uuid4()),
            profile_id=str(uuid.uuid4()),
            text="stale",
            status="generating",
        )
        db_session.add(gen)
        db_session.flush()

        # First run — should clean up
        result1 = purge_stale_state(db_session, data_dir)
        assert result1["sentinels"] == 1
        assert result1["stale_generations"] == 1

        # Second run — should be all zeros
        result2 = purge_stale_state(db_session, data_dir)
        assert all(v == 0 for v in result2.values())

    def test_purge_stale_state_returns_all_keys(self, client, db_session, data_dir):
        """purge_stale_state should always return all expected category keys."""
        from backend.utils.startup_cleanup import purge_stale_state

        result = purge_stale_state(db_session, data_dir)
        expected_keys = {
            "sentinels",
            "stale_generations",
            "orphaned_versions",
            "orphaned_story_items",
            "stale_autosaves",
            "orphaned_samples",
            "orphaned_files",
            "stale_downloads",
            "orphaned_adr_takes",
            "orphaned_conv_messages",
            "orphaned_agent_memory",
            "orphaned_entitlements",
        }
        assert set(result.keys()) == expected_keys

    def test_health_endpoint_works_during_cleanup(self, client, db_session, data_dir):
        """/health should respond even while purge_stale_state is running."""
        from backend.utils.startup_cleanup import purge_stale_state

        # Seed stale state
        sentinel = data_dir / ".keep-running"
        sentinel.write_text("concurrent-test")

        # Health should still work
        response = client.get("/health")
        assert response.status_code == 200

        # Now run cleanup
        result = purge_stale_state(db_session, data_dir)
        assert result["sentinels"] == 1

        # Health should still work after cleanup
        response = client.get("/health")
        assert response.status_code == 200
