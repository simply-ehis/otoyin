"""Integration test for the voice clone flow.

Verifies:
  - Creating a cloned profile with a valid engine
  - Adding an audio sample to the profile
  - Engine compatibility validation for cloned profiles
  - Profile sample count tracking
  - CLONING_ENGINES constant completeness
"""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models import Base
from backend.models import VoiceProfileCreate
from backend.services.profiles import (
    CLONING_ENGINES,
    _validate_profile_fields,
    add_profile_sample,
    create_profile,
    get_profile_samples,
    validate_profile_engine,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def mock_profiles_dir(tmp_path):
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()
    with (
        patch(
            "backend.services.profiles.config.get_profiles_dir",
            return_value=profiles_dir,
        ),
        patch(
            "backend.services.noise_reduction.reduce_noise_deepfilternet",
            side_effect=lambda audio, sr: audio,
        ),
    ):
        yield profiles_dir


# ── CLONING_ENGINES completeness ─────────────────────────────────────────


class TestCloningEngines:
    def test_is_nonempty_set(self):
        assert isinstance(CLONING_ENGINES, set)
        assert len(CLONING_ENGINES) > 0

    def test_all_are_strings(self):
        for engine in CLONING_ENGINES:
            assert isinstance(engine, str)

    def test_known_engines_present(self):
        """Core cloning engines should be in the set."""
        for engine in ("voxcpm2", "fish_speech_s2", "styletts2", "qwen3_tts", "parler_tts_gguf", "orpheus"):
            assert engine in CLONING_ENGINES, f"{engine} missing from CLONING_ENGINES"


# ── Cloned profile creation ──────────────────────────────────────────────


class TestClonedProfileCreation:
    @pytest.mark.asyncio
    async def test_create_cloned_profile(self, db, mock_profiles_dir):
        profile = await create_profile(
            VoiceProfileCreate(
                name="My Clone",
                voice_type="cloned",
                default_engine="qwen3_tts",
            ),
            db,
        )
        assert profile.id is not None
        assert profile.name == "My Clone"
        assert profile.voice_type == "cloned"
        assert profile.default_engine == "qwen3_tts"

    @pytest.mark.asyncio
    async def test_create_cloned_profile_all_engines(self, db, mock_profiles_dir):
        """Every CLONING_ENGINE should be usable as default_engine."""
        for i, engine in enumerate(CLONING_ENGINES):
            profile = await create_profile(
                VoiceProfileCreate(
                    name=f"Clone {engine} {i}",
                    voice_type="cloned",
                    default_engine=engine,
                ),
                db,
            )
            assert profile.default_engine == engine

    @pytest.mark.asyncio
    async def test_cloned_cannot_set_preset_fields(self, db, mock_profiles_dir):
        with pytest.raises(ValueError, match="Cloned profiles cannot set preset"):
            await create_profile(
                VoiceProfileCreate(
                    name="Bad Clone",
                    voice_type="cloned",
                    preset_engine="kokoro",
                    preset_voice_id="af_alloy",
                ),
                db,
            )

    @pytest.mark.asyncio
    async def test_cloned_cannot_set_design_prompt(self, db, mock_profiles_dir):
        with pytest.raises(ValueError, match="Cloned profiles cannot set design"):
            await create_profile(
                VoiceProfileCreate(
                    name="Bad Clone 2",
                    voice_type="cloned",
                    design_prompt="A warm voice",
                ),
                db,
            )


# ── Engine validation for cloned profiles ────────────────────────────────


class TestClonedEngineValidation:
    def test_valid_engine_passes(self):
        profile = MagicMock()
        profile.voice_type = "cloned"
        profile.design_prompt = None
        validate_profile_engine(profile, "qwen3_tts")

    def test_invalid_engine_raises(self):
        profile = MagicMock()
        profile.voice_type = "cloned"
        profile.design_prompt = None
        with pytest.raises(ValueError, match="does not support"):
            validate_profile_engine(profile, "invalid_engine_xyz")

    def test_non_cloning_engine_raises(self):
        """Kokoro is not a cloning engine."""
        profile = MagicMock()
        profile.voice_type = "cloned"
        profile.design_prompt = None
        with pytest.raises(ValueError, match="does not support"):
            validate_profile_engine(profile, "kokoro")


# ── Sample addition ──────────────────────────────────────────────────────


class TestClonedProfileSamples:
    @pytest.mark.asyncio
    async def test_add_sample_to_cloned_profile(self, db, mock_profiles_dir, tmp_path):
        profile = await create_profile(
            VoiceProfileCreate(
                name="With Sample",
                voice_type="cloned",
                default_engine="qwen3_tts",
            ),
            db,
        )

        # Create a real WAV file with non-silent audio (3 seconds at 24kHz)
        import wave

        wav_path = tmp_path / "sample.wav"
        num_samples = 24000 * 3  # 3 seconds
        # Generate a simple sine wave at 440Hz (audible signal)

        t = np.arange(num_samples) / 24000.0
        audio_data = (16000 * np.sin(2 * np.pi * 440 * t)).astype(np.int16)
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio_data.tobytes())

        sample = await add_profile_sample(
            profile.id,
            str(wav_path),
            "This is a test voice sample",
            db,
        )
        assert sample.id is not None
        assert sample.reference_text == "This is a test voice sample"

    @pytest.mark.asyncio
    async def test_list_samples_returns_added(self, db, mock_profiles_dir, tmp_path):
        profile = await create_profile(
            VoiceProfileCreate(
                name="Sample List",
                voice_type="cloned",
                default_engine="qwen3_tts",
            ),
            db,
        )

        import wave

        for text in ("Sample one", "Sample two"):
            wav_path = tmp_path / f"{text.replace(' ', '_')}.wav"
            num_samples = 24000 * 3  # 3 seconds

            t = np.arange(num_samples) / 24000.0
            audio_data = (16000 * np.sin(2 * np.pi * 440 * t)).astype(np.int16)
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(audio_data.tobytes())
            await add_profile_sample(profile.id, str(wav_path), text, db)

        samples = await get_profile_samples(profile.id, db)
        assert len(samples) == 2
        texts = {s.reference_text for s in samples}
        assert texts == {"Sample one", "Sample two"}


# ── Validate profile fields (cloned branch) ──────────────────────────────


class TestClonedFieldValidation:
    def test_valid_cloned_config(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine="qwen3_tts",
        )
        assert result is None

    def test_cloned_with_none_engine(self):
        """No default_engine is allowed for cloned profiles."""
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine=None,
        )
        assert result is None

    def test_cloned_with_invalid_engine(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt=None,
            default_engine="kokoro",
        )
        assert result is not None
        assert "cloned" in result.lower()

    def test_cloned_with_preset_engine_set(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine="kokoro",
            preset_voice_id=None,
            design_prompt=None,
            default_engine="qwen3_tts",
        )
        assert result is not None

    def test_cloned_with_design_prompt_set(self):
        result = _validate_profile_fields(
            voice_type="cloned",
            preset_engine=None,
            preset_voice_id=None,
            design_prompt="Some prompt",
            default_engine="qwen3_tts",
        )
        assert result is not None
