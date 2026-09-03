"""Tests for the refactored generation sub-functions.

Validates that the extracted sub-functions (_synthesize_cloud, _synthesize_local,
_postprocess, _persist) work correctly with GenerationContext.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np

from backend.services.generation import (
    GenerationContext,
    _persist,
    _postprocess,
)


class TestGenerationContext:
    """Test the GenerationContext dataclass."""

    def test_from_request(self):
        data = MagicMock()
        data.text = "Hello world"
        data.language = "en"
        data.seed = 42
        data.normalize = True
        data.instruct = None
        data.temperature = 0.7
        data.max_chunk_chars = 100
        data.crossfade_ms = 50
        data.emotion = None
        data.voice_clean = False

        ctx = GenerationContext.from_request(
            data=data,
            profile_id="p1",
            generation_id="g1",
            engine="kokoro",
            model_size="default",
        )
        assert ctx.generation_id == "g1"
        assert ctx.profile_id == "p1"
        assert ctx.text == "Hello world"
        assert ctx.engine == "kokoro"
        assert ctx.seed == 42
        assert ctx.normalize is True
        assert ctx.mode == "generate"

    def test_from_db_retry(self):
        gen = MagicMock()
        gen.id = "g1"
        gen.profile_id = "p1"
        gen.text = "Retry me"
        gen.language = "en"
        gen.engine = "kokoro"
        gen.model_size = "default"
        gen.seed = 42
        gen.instruct = None
        gen.use_cloud = False
        gen.voice_clean = False

        ctx = GenerationContext.from_db(gen, mode="retry")
        assert ctx.mode == "retry"
        assert ctx.text == "Retry me"

    def test_from_db_regenerate(self):
        gen = MagicMock()
        gen.id = "g2"
        gen.profile_id = "p2"
        gen.text = "Regen"
        gen.language = "es"
        gen.engine = "fish_speech"
        gen.model_size = "default"
        gen.seed = 99
        gen.instruct = None
        gen.use_cloud = False
        gen.voice_clean = False

        ctx = GenerationContext.from_db(gen, mode="regenerate", version_id="v1")
        assert ctx.mode == "regenerate"
        assert ctx.version_id == "v1"
        assert ctx.language == "es"


class TestPostprocess:
    """Test the _postprocess sub-function."""

    def test_no_processing(self):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="retry",
            normalize=False,
        )
        audio = np.zeros(1000, dtype=np.float32)
        result_audio, _sr = _postprocess(ctx, audio, 24000)
        np.testing.assert_array_equal(result_audio, audio)

    def test_normalize_applied(self):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="generate",
            normalize=True,
        )
        audio = np.ones(1000, dtype=np.float32) * 0.001  # very quiet
        result_audio, _sr = _postprocess(ctx, audio, 24000)
        # After normalization, audio should be louder
        assert np.max(np.abs(result_audio)) > np.max(np.abs(audio))

    def test_normalize_skipped_on_retry_when_not_requested(self):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="retry",
            normalize=False,
        )
        audio = np.ones(1000, dtype=np.float32) * 0.001
        result_audio, _sr = _postprocess(ctx, audio, 24000)
        # Retry mode skips normalize when not explicitly requested
        np.testing.assert_array_almost_equal(result_audio, audio)

    def test_voice_clean_degrades_gracefully(self):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="generate",
            voice_clean=True,
        )
        audio = np.ones(1000, dtype=np.float32)
        # Should not raise even if tts_enhancer import fails
        result_audio, _sr = _postprocess(ctx, audio, 24000)
        assert len(result_audio) > 0


class TestPersist:
    """Test the _persist sub-function."""

    def test_persist_generate(self, tmp_path):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="generate",
        )
        audio = np.ones(24000, dtype=np.float32)
        db = MagicMock()

        with (
            patch("backend.services.generation.config") as mock_cfg,
            patch("backend.services.generation._save_generate", return_value="/storage/g1.wav") as mock_save,
        ):
            mock_cfg.get_generations_dir.return_value = tmp_path
            result = _persist(ctx, audio, 24000, lambda *a, **kw: None, db)
            assert result == "/storage/g1.wav"
            mock_save.assert_called_once()

    def test_persist_retry(self, tmp_path):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="retry",
        )
        audio = np.ones(24000, dtype=np.float32)
        db = MagicMock()

        with (
            patch("backend.services.generation.config") as mock_cfg,
            patch("backend.services.generation._save_retry", return_value="/storage/g1.wav"),
        ):
            mock_cfg.get_generations_dir.return_value = tmp_path
            result = _persist(ctx, audio, 24000, lambda *a, **kw: None, db)
            assert result == "/storage/g1.wav"

    def test_persist_regenerate(self, tmp_path):
        ctx = GenerationContext(
            generation_id="g1",
            profile_id="p1",
            text="hi",
            language="en",
            engine="kokoro",
            model_size="default",
            seed=None,
            mode="regenerate",
            version_id="v1",
        )
        audio = np.ones(24000, dtype=np.float32)
        db = MagicMock()

        with (
            patch("backend.services.generation.config") as mock_cfg,
            patch("backend.services.generation._save_regenerate", return_value="/storage/g1_reg.wav"),
        ):
            mock_cfg.get_generations_dir.return_value = tmp_path
            result = _persist(ctx, audio, 24000, lambda *a, **kw: None, db)
            assert result == "/storage/g1_reg.wav"
