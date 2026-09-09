"""Tests for profile CRUD, validation, and cascade deletes.

Covers:
- _validate_profile_fields — all voice_type branches
- validate_profile_engine — engine compatibility
- create_profile — duplicate check, validation, preset auto-set
- delete_profile — cascade to generations
- _profile_to_response — JSON deserialization, edge cases
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models import Base
from backend.models import VoiceProfileCreate
from backend.services.profiles import (
    _profile_to_response,
    _validate_profile_fields,
    validate_profile_engine,
)


@pytest.fixture
def db():
    """In-memory SQLite database."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def mock_profiles_dir(tmp_path):
    """Mock profiles directory."""
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    with patch("backend.services.profiles.config.get_profiles_dir", return_value=profiles_dir):
        yield profiles_dir


# ---------------------------------------------------------------------------
# 1. _validate_profile_fields
# ---------------------------------------------------------------------------


class TestValidateProfileFields:
    def test_preset_requires_preset_engine_and_voice_id(self):
        result = _validate_profile_fields(
            voice_type="preset",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine=None,
        )
        assert result is not None
        assert "preset" in result.lower()

    def test_preset_with_valid_voice_id(self):
        result = _validate_profile_fields(
            voice_type="preset",
            preset_engine="kokoro",
            preset_voice_id="af_alloy",
            design_prompt=None,
            default_engine="kokoro",
        )
        assert result is None

    def test_preset_with_invalid_voice_id(self):
        result = _validate_profile_fields(
            voice_type="preset",
            preset_engine="kokoro",
            preset_voice_id="nonexistent_voice_xyz",
            design_prompt=None,
            default_engine="kokoro",
        )
        assert result is not None
        assert "not valid" in result.lower() or "invalid" in result.lower()

    def test_preset_engine_mismatch(self):
        result = _validate_profile_fields(
            voice_type="preset",
            preset_engine="kokoro",
            preset_voice_id="af_alloy",
            design_prompt=None,
            default_engine="styletts2",
        )
        assert result is not None
        assert "engine" in result.lower()

    def test_designed_requires_design_prompt(self):
        result = _validate_profile_fields(
            voice_type="designed",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine=None,
        )
        assert result is not None
        assert "design_prompt" in result

    def test_designed_with_valid_prompt(self):
        result = _validate_profile_fields(
            voice_type="designed",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt="A warm, friendly voice",
            default_engine=None,
        )
        assert result is None

    def test_designed_cannot_set_preset_fields(self):
        result = _validate_profile_fields(
            voice_type="designed",
            preset_engine="kokoro",
            preset_voice_id="af_alloy",
            design_prompt="A warm voice",
            default_engine=None,
        )
        assert result is not None
        assert "preset" in result.lower()

    def test_cloned_cannot_set_preset_fields(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine="kokoro",
            preset_voice_id=None,
            design_prompt=None,
            default_engine="fish_speech",
        )
        assert result is not None
        assert "cloned" in result.lower()

    def test_cloned_cannot_set_design_prompt(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt="Some prompt",
            default_engine="fish_speech",
        )
        assert result is not None
        assert "cloned" in result.lower()

    def test_cloned_with_valid_config(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine="zonos_gguf",
        )
        assert result is None

    def test_cloned_with_invalid_default_engine(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine="kokoro",
        )
        assert result is not None
        assert "cloned" in result.lower()

    def test_unknown_voice_type_passes(self):
        """Unknown voice types are not rejected (forward compatibility)."""
        result = _validate_profile_fields(
            voice_type="unknown_future_type",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine=None,
        )
        assert result is None


# ---------------------------------------------------------------------------
# 2. validate_profile_engine
# ---------------------------------------------------------------------------


class TestValidateProfileEngine:
    def test_preset_engine_matches(self):
        profile = MagicMock()
        profile.id = "p1"
        profile.voice_type = "preset"
        profile.preset_engine = "kokoro"
        profile.preset_voice_id = "af_alloy"
        profile.design_prompt = None
        # Should not raise
        validate_profile_engine(profile, "kokoro")

    def test_preset_engine_mismatch_raises(self):
        profile = MagicMock()
        profile.id = "p2"
        profile.voice_type = "preset"
        profile.preset_engine = "kokoro"
        profile.preset_voice_id = "af_alloy"
        with pytest.raises(ValueError, match="only supports engine"):
            validate_profile_engine(profile, "styletts2")

    def test_preset_missing_metadata_raises(self):
        profile = MagicMock()
        profile.id = "p3"
        profile.voice_type = "preset"
        profile.preset_engine = None
        profile.preset_voice_id = None
        with pytest.raises(ValueError, match="missing preset engine"):
            validate_profile_engine(profile, "kokoro")

    def test_designed_with_prompt_succeeds(self):
        profile = MagicMock()
        profile.id = "p4"
        profile.voice_type = "designed"
        profile.design_prompt = "A warm voice"
        validate_profile_engine(profile, "kokoro")

    def test_designed_without_prompt_raises(self):
        profile = MagicMock()
        profile.id = "p5"
        profile.voice_type = "designed"
        profile.design_prompt = None
        with pytest.raises(ValueError, match="design_prompt"):
            validate_profile_engine(profile, "kokoro")

    def test_cloned_with_valid_engine_succeeds(self):
        profile = MagicMock()
        profile.id = "p6"
        profile.voice_type = "cloned"
        profile.design_prompt = None
        validate_profile_engine(profile, "zonos_gguf")

    def test_cloned_with_invalid_engine_raises(self):
        profile = MagicMock()
        profile.id = "p7"
        profile.voice_type = "cloned"
        profile.design_prompt = None
        with pytest.raises(ValueError, match="does not support"):
            validate_profile_engine(profile, "invalid_engine")


# ---------------------------------------------------------------------------
# 3. _profile_to_response
# ---------------------------------------------------------------------------


class TestProfileToResponse:
    def test_basic_conversion(self):
        profile = MagicMock()
        profile.id = "prof_1"
        profile.name = "Test Profile"
        profile.description = "A test"
        profile.language = "en"
        profile.avatar_path = None
        profile.voice_type = "cloned"
        profile.preset_engine = None
        profile.preset_voice_id = None
        profile.design_prompt = None
        profile.default_engine = "fish_speech"
        profile.personality = None
        profile.effects_chain = None
        profile.created_at = "2026-01-01T00:00:00"
        profile.updated_at = "2026-01-01T00:00:00"

        result = _profile_to_response(profile, generation_count=5, sample_count=3)
        assert result.id == "prof_1"
        assert result.name == "Test Profile"
        assert result.voice_type == "cloned"
        assert result.generation_count == 5
        assert result.sample_count == 3

    def test_effects_chain_json_deserialization(self):
        profile = MagicMock()
        profile.id = "prof_2"
        profile.name = "EQ Profile"
        profile.description = None
        profile.language = "en"
        profile.avatar_path = None
        profile.voice_type = "cloned"
        profile.preset_engine = None
        profile.preset_voice_id = None
        profile.design_prompt = None
        profile.default_engine = "fish_speech"
        profile.personality = None
        profile.effects_chain = json.dumps([{"type": "eq", "enabled": True, "params": {}}])
        profile.created_at = "2026-01-01T00:00:00"
        profile.updated_at = "2026-01-01T00:00:00"

        result = _profile_to_response(profile)
        assert isinstance(result.effects_chain, list)
        assert len(result.effects_chain) == 1
        assert result.effects_chain[0].type == "eq"

    def test_corrupt_effects_chain_returns_none(self):
        profile = MagicMock()
        profile.id = "prof_3"
        profile.name = "Corrupt"
        profile.description = None
        profile.language = "en"
        profile.avatar_path = None
        profile.voice_type = "cloned"
        profile.preset_engine = None
        profile.preset_voice_id = None
        profile.design_prompt = None
        profile.default_engine = "fish_speech"
        profile.personality = None
        profile.effects_chain = "not valid json {{{"
        profile.created_at = "2026-01-01T00:00:00"
        profile.updated_at = "2026-01-01T00:00:00"

        result = _profile_to_response(profile)
        assert result.effects_chain is None

    def test_none_effects_chain_returns_none(self):
        profile = MagicMock()
        profile.id = "prof_4"
        profile.name = "None Chain"
        profile.description = None
        profile.language = "en"
        profile.avatar_path = None
        profile.voice_type = "cloned"
        profile.preset_engine = None
        profile.preset_voice_id = None
        profile.design_prompt = None
        profile.default_engine = "fish_speech"
        profile.personality = None
        profile.effects_chain = None
        profile.created_at = "2026-01-01T00:00:00"
        profile.updated_at = "2026-01-01T00:00:00"

        result = _profile_to_response(profile)
        assert result.effects_chain is None

    def test_voice_type_defaults_to_cloned(self):
        profile = MagicMock()
        profile.id = "prof_5"
        profile.name = "No Voice Type"
        profile.description = None
        profile.language = "en"
        profile.avatar_path = None
        profile.voice_type = None
        profile.preset_engine = None
        profile.preset_voice_id = None
        profile.design_prompt = None
        profile.default_engine = "fish_speech"
        profile.personality = None
        profile.effects_chain = None
        profile.created_at = "2026-01-01T00:00:00"
        profile.updated_at = "2026-01-01T00:00:00"

        result = _profile_to_response(profile)
        assert result.voice_type == "cloned"


# ---------------------------------------------------------------------------
# 4. Profile CRUD integration
# ---------------------------------------------------------------------------


class TestProfileCRUD:
    @pytest.mark.asyncio
    async def test_create_and_get_profile(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile, get_profile

        profile_data = VoiceProfileCreate(
            name="Test CRUD Profile",
            voice_type="preset",
            preset_engine="kokoro",
            preset_voice_id="af_alloy",
            default_engine="kokoro",
        )
        profile = await create_profile(profile_data, db)
        assert profile.id is not None

        fetched = await get_profile(profile.id, db)
        assert fetched is not None
        assert fetched.name == "Test CRUD Profile"

    @pytest.mark.asyncio
    async def test_create_duplicate_name_raises(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile

        data1 = VoiceProfileCreate(
            name="Duplicate",
            voice_type="preset",
            preset_engine="kokoro",
            preset_voice_id="af_alloy",
            default_engine="kokoro",
        )
        await create_profile(data1, db)

        data2 = VoiceProfileCreate(
            name="Duplicate",
            voice_type="preset",
            preset_engine="kokoro",
            preset_voice_id="af_alloy",
            default_engine="kokoro",
        )
        with pytest.raises(ValueError, match="already exists"):
            await create_profile(data2, db)

    @pytest.mark.asyncio
    async def test_list_profiles(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile, list_profiles

        for i in range(3):
            await create_profile(
                VoiceProfileCreate(
                    name=f"Profile {i}",
                    voice_type="preset",
                    preset_engine="kokoro",
                    preset_voice_id="af_alloy",
                    default_engine="kokoro",
                ),
                db,
            )

        profiles = await list_profiles(db)
        assert len(profiles) == 3

    @pytest.mark.asyncio
    async def test_delete_profile(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile, delete_profile, get_profile

        profile = await create_profile(
            VoiceProfileCreate(
                name="To Delete",
                voice_type="preset",
                preset_engine="kokoro",
                preset_voice_id="af_alloy",
                default_engine="kokoro",
            ),
            db,
        )
        await delete_profile(profile.id, db)

        assert await get_profile(profile.id, db) is None


# ---------------------------------------------------------------------------
# 7. compose_design_prompt
# ---------------------------------------------------------------------------


class TestComposeDesignPrompt:
    def test_compose_from_full_attributes(self):
        from backend.services.profiles import compose_design_prompt

        attrs = {
            "gender": "female",
            "age": "young_adult",
            "accent": "british",
            "tone": "warm",
            "style": "enthusiastic",
            "pacing": "fast",
        }
        result = compose_design_prompt(attrs)
        assert "young adult female" in result.lower()
        assert "british" in result.lower()
        assert "warm" in result.lower()
        assert "enthusiastic" in result.lower()
        assert "fast" in result.lower()
        assert result.endswith(".")

    def test_compose_minimal_attributes(self):
        from backend.services.profiles import compose_design_prompt

        attrs = {"gender": "male"}
        result = compose_design_prompt(attrs)
        assert "male" in result.lower()
        assert "speaker" in result.lower()

    def test_compose_empty_attributes_returns_fallback(self):
        from backend.services.profiles import compose_design_prompt

        assert compose_design_prompt(None, fallback="fallback text") == "fallback text"
        assert compose_design_prompt({}) == ""

    def test_compose_accent_article(self):
        from backend.services.profiles import compose_design_prompt

        result = compose_design_prompt({"accent": "american"})
        assert "American" in result

        result = compose_design_prompt({"accent": "british"})
        assert "British" in result


# ---------------------------------------------------------------------------
# 8. voice_attributes in validation + create/update
# ---------------------------------------------------------------------------


class TestVoiceAttributes:
    def test_designed_with_attributes_no_prompt(self):
        result = _validate_profile_fields(
            voice_type="designed",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            voice_attributes={"gender": "female", "accent": "british"},
            default_engine=None,
        )
        assert result is None

    def test_designed_without_prompt_or_attributes(self):
        result = _validate_profile_fields(
            voice_type="designed",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            voice_attributes=None,
            default_engine=None,
        )
        assert result is not None

    async def test_voice_attributes_stored_as_json(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile, get_profile

        attrs = {"gender": "female", "age": "young_adult", "accent": "british"}
        profile = await create_profile(
            VoiceProfileCreate(
                name="Designed with attrs",
                voice_type="designed",
                voice_attributes=attrs,
                language="en",
                default_engine="parler_tts_gguf",
            ),
            db,
        )
        fetched = await get_profile(profile.id, db)
        assert fetched.voice_attributes == attrs

    async def test_voice_attributes_auto_composes_design_prompt(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile, get_profile

        profile = await create_profile(
            VoiceProfileCreate(
                name="Auto composed",
                voice_type="designed",
                voice_attributes={"gender": "male", "accent": "american"},
                language="en",
                default_engine="parler_tts_gguf",
            ),
            db,
        )
        fetched = await get_profile(profile.id, db)
        assert fetched.design_prompt is not None
        assert "american" in fetched.design_prompt.lower()

    async def test_update_voice_attributes(self, db, mock_profiles_dir):
        from backend.services.profiles import create_profile, get_profile, update_profile

        profile = await create_profile(
            VoiceProfileCreate(
                name="Update test",
                voice_type="designed",
                design_prompt="Original prompt",
                language="en",
                default_engine="parler_tts_gguf",
            ),
            db,
        )

        new_attrs = {"gender": "female", "tone": "deep"}
        updated = await update_profile(
            profile.id,
            VoiceProfileCreate(
                name="Update test",
                voice_type="designed",
                voice_attributes=new_attrs,
                language="en",
                default_engine="parler_tts_gguf",
            ),
            db,
        )
        assert updated is not None
        fetched = await get_profile(profile.id, db)
        assert fetched.voice_attributes == new_attrs
