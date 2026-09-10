"""Tests for startup stale-state detection and cleanup."""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models import (
    ADRLine,
    ADRTake,
    AgentMemory,
    AudioStudioSession,
    Base,
    ConversationMessage,
    Entitlement,
    Generation,
    GenerationVersion,
    ModelDownload,
    ProfileSample,
    SessionAutosaveSnapshot,
    Story,
    StoryItem,
    VoiceProfile,
)


@pytest.fixture
def db_session(tmp_path):
    """Create an in-memory SQLite database with all tables."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def data_dir(tmp_path):
    """Create a temporary data directory with generations subfolder."""
    d = tmp_path / "data"
    d.mkdir()
    (d / "generations").mkdir()
    return d


def _make_gen(db, status="completed", audio_path=None):
    """Helper to create a Generation row."""
    gen = Generation(
        id=str(uuid.uuid4()),
        profile_id=str(uuid.uuid4()),
        text="Hello world",
        status=status,
        audio_path=audio_path,
    )
    db.add(gen)
    db.flush()
    return gen


def _make_profile(db):
    """Helper to create a VoiceProfile row."""
    p = VoiceProfile(id=str(uuid.uuid4()), name=f"profile-{uuid.uuid4().hex[:8]}")
    db.add(p)
    db.flush()
    return p


# =========================================================================
# 1. Sentinel purge
# =========================================================================


class TestPurgeStaleSentinels:
    def test_removes_keep_running_sentinel(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        (data_dir / ".keep-running").write_text("stay")
        count = purge_stale_state(db_session, data_dir)
        assert count["sentinels"] == 1
        assert not (data_dir / ".keep-running").exists()

    def test_no_sentinel_is_noop(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        count = purge_stale_state(db_session, data_dir)
        assert count["sentinels"] == 0

    def test_removes_old_sentinel(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        (data_dir / ".keep-running.old").write_text("old")
        count = purge_stale_state(db_session, data_dir)
        assert count["sentinels"] == 1


# =========================================================================
# 2. Stale generation records
# =========================================================================


class TestPurgeStaleGenerations:
    def test_marks_generating_as_failed(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen = _make_gen(db_session, status="generating")
        count = purge_stale_state(db_session, data_dir)
        assert count["stale_generations"] == 1
        db_session.refresh(gen)
        assert gen.status == "failed"
        assert "shut down" in gen.error

    def test_marks_loading_model_as_failed(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        _make_gen(db_session, status="loading_model")
        count = purge_stale_state(db_session, data_dir)
        assert count["stale_generations"] == 1

    def test_completed_not_touched(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen = _make_gen(db_session, status="completed")
        count = purge_stale_state(db_session, data_dir)
        assert count["stale_generations"] == 0
        db_session.refresh(gen)
        assert gen.status == "completed"

    def test_multiple_stale_generations(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        _make_gen(db_session, status="generating")
        _make_gen(db_session, status="loading_model")
        _make_gen(db_session, status="generating")
        count = purge_stale_state(db_session, data_dir)
        assert count["stale_generations"] == 3


# =========================================================================
# 3. Orphaned GenerationVersion rows
# =========================================================================


class TestPurgeOrphanedVersions:
    def test_deletes_version_without_parent(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen = _make_gen(db_session)
        ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id=gen.id,
            label="original",
            audio_path="test.wav",
        )
        db_session.add(ver)
        db_session.flush()

        # Delete the parent generation
        db_session.delete(gen)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_versions"] == 1
        assert db_session.query(GenerationVersion).count() == 0

    def test_preserves_version_with_parent(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen = _make_gen(db_session)
        ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id=gen.id,
            label="original",
            audio_path="test.wav",
        )
        db_session.add(ver)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_versions"] == 0
        assert db_session.query(GenerationVersion).count() == 1


# =========================================================================
# 4. Orphaned StoryItem rows
# =========================================================================


class TestPurgeOrphanedStoryItems:
    def test_deletes_item_without_generation(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen = _make_gen(db_session)
        story = Story(id=str(uuid.uuid4()), name="Test Story")
        db_session.add(story)
        db_session.flush()

        item = StoryItem(
            id=str(uuid.uuid4()),
            story_id=story.id,
            generation_id=gen.id,
            start_time_ms=0,
            track=0,
        )
        db_session.add(item)
        db_session.flush()

        db_session.delete(gen)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_story_items"] == 1
        assert db_session.query(StoryItem).count() == 0


# =========================================================================
# 5. Stale autosave snapshots
# =========================================================================


class TestPurgeStaleAutosaves:
    def test_deletes_snapshot_without_studio_session(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        snap = SessionAutosaveSnapshot(
            id=str(uuid.uuid4()),
            session_id="nonexistent-session",
            data="{}",
            kind="studio",
        )
        db_session.add(snap)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["stale_autosaves"] == 1
        assert db_session.query(SessionAutosaveSnapshot).count() == 0

    def test_preserves_snapshot_with_session(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        session = AudioStudioSession(id=str(uuid.uuid4()), name="Test")
        db_session.add(session)
        db_session.flush()

        snap = SessionAutosaveSnapshot(
            id=str(uuid.uuid4()),
            session_id=session.id,
            data="{}",
            kind="studio",
        )
        db_session.add(snap)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["stale_autosaves"] == 0
        assert db_session.query(SessionAutosaveSnapshot).count() == 1


# =========================================================================
# 6. Orphaned profile samples
# =========================================================================


class TestPurgeOrphanedProfileSamples:
    def test_deletes_sample_without_profile(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        sample = ProfileSample(
            id=str(uuid.uuid4()),
            profile_id="nonexistent-profile",
            audio_path="test.wav",
            reference_text="hello",
        )
        db_session.add(sample)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_samples"] == 1
        assert db_session.query(ProfileSample).count() == 0


# =========================================================================
# 7. Orphaned audio files
# =========================================================================


class TestPurgeOrphanedAudioFiles:
    def test_removes_chunk_files_for_deleted_generation(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen_id = str(uuid.uuid4())
        gen_dir = data_dir / "generations"
        chunk = gen_dir / f"{gen_id}_chunk_0.wav"
        chunk.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")  # minimal WAV header

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_files"] == 1
        assert not chunk.exists()

    def test_keeps_chunk_files_for_existing_generation(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen = _make_gen(db_session)
        gen_dir = data_dir / "generations"
        chunk = gen_dir / f"{gen.id}_chunk_0.wav"
        chunk.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_files"] == 0
        assert chunk.exists()

    def test_removes_main_audio_for_deleted_generation(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        gen_id = str(uuid.uuid4())
        gen_dir = data_dir / "generations"
        audio = gen_dir / f"{gen_id}.wav"
        audio.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_files"] == 1
        assert not audio.exists()

    def test_keeps_audio_referenced_by_active_version(self, db_session, data_dir):
        """An audio file is kept if any GenerationVersion (whose parent generation
        still exists) references it via audio_path."""
        from backend.utils.startup_cleanup import purge_stale_state

        # Parent generation that still exists in DB
        parent_gen = _make_gen(db_session)
        gen_dir = data_dir / "generations"

        # A different gen ID for the orphaned file (its generation was deleted)
        orphan_gen_id = str(uuid.uuid4())
        audio_path_str = f"{orphan_gen_id}_processed.wav"

        # Version referencing the orphan file, attached to the LIVE parent generation
        ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id=parent_gen.id,
            label="processed",
            audio_path=audio_path_str,
        )
        db_session.add(ver)
        db_session.flush()

        # Write the orphan audio file
        audio = gen_dir / audio_path_str
        audio.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_files"] == 0
        assert audio.exists()


# =========================================================================
# 8. Stale ModelDownload rows
# =========================================================================


class TestPurgeStaleModelDownloads:
    def test_removes_download_with_missing_local_path(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        dl = ModelDownload(
            id=str(uuid.uuid4()),
            model_name="test-model",
            engine="kokoro",
            local_path="/nonexistent/path/model.bin",
            downloaded_at=datetime.now(UTC),
        )
        db_session.add(dl)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["stale_downloads"] == 1
        assert db_session.query(ModelDownload).count() == 0

    def test_keeps_download_with_existing_local_path(self, db_session, data_dir, tmp_path):
        from backend.utils.startup_cleanup import purge_stale_state

        model_file = tmp_path / "model.bin"
        model_file.write_bytes(b"model data")

        dl = ModelDownload(
            id=str(uuid.uuid4()),
            model_name="test-model",
            engine="kokoro",
            local_path=str(model_file),
            downloaded_at=datetime.now(UTC),
        )
        db_session.add(dl)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["stale_downloads"] == 0
        assert db_session.query(ModelDownload).count() == 1


# =========================================================================
# 9. Orphaned ADR rows
# =========================================================================


class TestPurgeOrphanedADR:
    def test_deletes_take_without_line(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        take = ADRTake(
            id=str(uuid.uuid4()),
            line_id="nonexistent",
            take_number=1,
            audio_path="test.wav",
        )
        db_session.add(take)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_adr_takes"] >= 1
        assert db_session.query(ADRTake).count() == 0

    def test_deletes_line_without_session(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        line = ADRLine(
            id=str(uuid.uuid4()),
            session_id="nonexistent",
            line_index=0,
            original_text="Hello",
            character="Actor",
        )
        db_session.add(line)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_adr_takes"] >= 1


# =========================================================================
# 10. Orphaned conversation messages
# =========================================================================


class TestPurgeOrphanedConvMessages:
    def test_deletes_message_without_conversation(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        msg = ConversationMessage(
            id=str(uuid.uuid4()),
            conversation_id="nonexistent",
            role="user",
            content="Hello",
        )
        db_session.add(msg)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_conv_messages"] == 1
        assert db_session.query(ConversationMessage).count() == 0


# =========================================================================
# 11. Orphaned agent memory
# =========================================================================


class TestPurgeOrphanedAgentMemory:
    def test_deletes_memory_with_deleted_source(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        mem = AgentMemory(
            id=str(uuid.uuid4()),
            agent_type="assistant",
            category="preference",
            key="fav_color",
            value="blue",
            source_conversation_id="nonexistent",
        )
        db_session.add(mem)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_agent_memory"] == 1

    def test_keeps_memory_without_source(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        mem = AgentMemory(
            id=str(uuid.uuid4()),
            agent_type="assistant",
            category="preference",
            key="fav_color",
            value="blue",
            source_conversation_id=None,
        )
        db_session.add(mem)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_agent_memory"] == 0


# =========================================================================
# 12. Orphaned entitlements
# =========================================================================


class TestPurgeOrphanedEntitlements:
    def test_deletes_entitlement_without_license(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        ent = Entitlement(
            id=str(uuid.uuid4()),
            license_id="nonexistent",
            entitlement="pro_features",
        )
        db_session.add(ent)
        db_session.flush()

        count = purge_stale_state(db_session, data_dir)
        assert count["orphaned_entitlements"] == 1
        assert db_session.query(Entitlement).count() == 0


# =========================================================================
# 13. Integration: full purge returns correct summary
# =========================================================================


class TestPurgeStaleStateIntegration:
    def test_returns_all_keys(self, db_session, data_dir):
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
            "db_pruned",
        }
        assert set(result.keys()) == expected_keys

    def test_empty_database_returns_zeros(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        result = purge_stale_state(db_session, data_dir)
        assert all(v == 0 for v in result.values())

    def test_mixed_stale_and_clean_data(self, db_session, data_dir):
        from backend.utils.startup_cleanup import purge_stale_state

        # Create one good generation and one stale
        good_gen = _make_gen(db_session, status="completed")
        stale_gen = _make_gen(db_session, status="generating")

        # Create an orphaned version
        ver = GenerationVersion(
            id=str(uuid.uuid4()),
            generation_id="deleted-gen-id",
            label="orphan",
            audio_path="orphan.wav",
        )
        db_session.add(ver)
        db_session.flush()

        # Create a sentinel
        (data_dir / ".keep-running").write_text("1")

        result = purge_stale_state(db_session, data_dir)
        assert result["stale_generations"] == 1
        assert result["orphaned_versions"] == 1
        assert result["sentinels"] == 1

        # Good generation still there with correct status
        db_session.refresh(good_gen)
        assert good_gen.status == "completed"

        # Stale generation is marked failed, not deleted
        db_session.refresh(stale_gen)
        assert stale_gen.status == "failed"
        assert db_session.query(Generation).count() == 2
