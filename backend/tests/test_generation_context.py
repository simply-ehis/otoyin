"""Tests for the GenerationContext dataclass — construction, defaults,
factory methods, and immutability.
"""

import pytest

from backend.services.generation import GenerationContext


class TestGenerationContextDefaults:
    """Default values and required fields."""

    def test_minimal_construction(self):
        ctx = GenerationContext(
            generation_id="gen-1",
            profile_id="p1",
            text="Hello",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=42,
        )
        assert ctx.mode == "generate"
        assert ctx.normalize is False
        assert ctx.effects_chain is None
        assert ctx.instruct is None
        assert ctx.temperature is None
        assert ctx.max_chunk_chars is None
        assert ctx.crossfade_ms is None
        assert ctx.version_id is None
        assert ctx.use_cloud is False
        assert ctx.emotion is None
        assert ctx.voice_clean is False

    def test_frozen(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
        )
        with pytest.raises(AttributeError):
            ctx.text = "changed"  # type: ignore[misc]

    def test_mode_generate_is_default(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
        )
        assert ctx.mode == "generate"

    def test_all_modes_valid(self):
        for mode in ("generate", "retry", "regenerate"):
            ctx = GenerationContext(
                generation_id="g",
                profile_id="p",
                text="t",
                language="en",
                engine="kokoro",
                model_size="82M",
                seed=1,
                mode=mode,
            )
            assert ctx.mode == mode


class TestGenerationContextOptionalFields:
    """Optional fields accept various values."""

    def test_seed_none(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=None,
        )
        assert ctx.seed is None

    def test_voice_clean_true(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
            voice_clean=True,
        )
        assert ctx.voice_clean is True

    def test_emotion_set(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
            emotion="happy",
        )
        assert ctx.emotion == "happy"

    def test_effects_chain_list(self):
        chain = [{"effect": "reverb", "params": {"room_size": 0.5}}]
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
            effects_chain=chain,
        )
        assert ctx.effects_chain == chain

    def test_temperature_range(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
            temperature=0.7,
        )
        assert ctx.temperature == 0.7

    def test_crossfade_ms(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
            crossfade_ms=50,
        )
        assert ctx.crossfade_ms == 50

    def test_use_cloud_true(self):
        ctx = GenerationContext(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
            use_cloud=True,
        )
        assert ctx.use_cloud is True


class TestGenerationContextFromRequest:
    """from_request factory method."""

    def test_from_request_minimal(self):
        class MockData:
            text = "Hello"
            language = "en"
            seed = 42
            normalize = False
            instruct = None
            temperature = None
            max_chunk_chars = None
            crossfade_ms = None
            emotion = None
            voice_clean = False

        ctx = GenerationContext.from_request(
            data=MockData(),
            profile_id="p1",
            generation_id="gen-1",
            engine="kokoro",
            model_size="82M",
        )
        assert ctx.generation_id == "gen-1"
        assert ctx.profile_id == "p1"
        assert ctx.text == "Hello"
        assert ctx.engine == "kokoro"
        assert ctx.mode == "generate"
        assert ctx.effects_chain is None

    def test_from_request_with_optional_fields(self):
        class MockData:
            text = "Test"
            language = "fr"
            seed = 7
            normalize = True
            instruct = "speak slowly"
            temperature = 0.8
            max_chunk_chars = 200
            crossfade_ms = 30
            emotion = "sad"
            voice_clean = True

        ctx = GenerationContext.from_request(
            data=MockData(),
            profile_id="p2",
            generation_id="gen-2",
            engine="chattts",
            model_size="large",
        )
        assert ctx.language == "fr"
        assert ctx.normalize is True
        assert ctx.instruct == "speak slowly"
        assert ctx.temperature == 0.8
        assert ctx.emotion == "sad"
        assert ctx.voice_clean is True


class TestGenerationContextFromDB:
    """from_db factory method with mock database records."""

    def test_from_db_retry(self):
        class MockGen:
            id = "gen-1"
            profile_id = "p1"
            text = "Hello"
            language = "en"
            engine = "kokoro"
            model_size = "82M"
            seed = 42
            instruct = None
            use_cloud = False
            voice_clean = False

        ctx = GenerationContext.from_db(MockGen(), mode="retry")
        assert ctx.mode == "retry"
        assert ctx.generation_id == "gen-1"
        assert ctx.seed == 42

    def test_from_db_regenerate(self):
        class MockGen:
            id = "gen-2"
            profile_id = "p2"
            text = "World"
            language = "en"
            engine = "chattts"
            model_size = "default"
            seed = 99
            instruct = None
            use_cloud = True
            voice_clean = True

        ctx = GenerationContext.from_db(MockGen(), mode="regenerate", version_id="v1")
        assert ctx.mode == "regenerate"
        assert ctx.version_id == "v1"
        assert ctx.use_cloud is True
        assert ctx.voice_clean is True

    def test_from_db_handles_none_fields(self):
        """DB records with None fields should use sensible defaults."""

        class MockGen:
            id = "gen-3"
            profile_id = "p3"
            text = None
            language = None
            engine = None
            model_size = None
            seed = None
            instruct = None
            use_cloud = False
            voice_clean = False

        ctx = GenerationContext.from_db(MockGen(), mode="retry")
        assert ctx.text == ""
        assert ctx.language == "en"
        assert ctx.engine == "kokoro"
        assert ctx.model_size == "default"
        assert ctx.seed is None

    def test_from_db_handles_missing_attributes(self):
        """Older DB records may not have use_cloud or voice_clean."""

        class OldGen:
            id = "gen-old"
            profile_id = "p"
            text = "t"
            language = "en"
            engine = "kokoro"
            model_size = "82M"
            seed = 1
            instruct = None
            # No use_cloud or voice_clean attributes

        ctx = GenerationContext.from_db(OldGen(), mode="retry")
        assert ctx.use_cloud is False
        assert ctx.voice_clean is False


class TestGenerationContextEquality:
    """Two identical contexts should be equal."""

    def test_equal_contexts(self):
        kwargs = dict(
            generation_id="g",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
        )
        ctx1 = GenerationContext(**kwargs)
        ctx2 = GenerationContext(**kwargs)
        assert ctx1 == ctx2

    def test_different_contexts_not_equal(self):
        ctx1 = GenerationContext(
            generation_id="g1",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
        )
        ctx2 = GenerationContext(
            generation_id="g2",
            profile_id="p",
            text="t",
            language="en",
            engine="kokoro",
            model_size="82M",
            seed=1,
        )
        assert ctx1 != ctx2
