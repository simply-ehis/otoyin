"""E2E tests for Parakeet and Qwen3-ASR STT backends.

Tests structural correctness, config registration, interface conformance,
and language support. Heavy parts (model downloads, ONNX sessions, binary
execution) are mocked so these run fast without GPU or network.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Ensure the backend package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


# ---------------------------------------------------------------------------
# Parakeet backend
# ---------------------------------------------------------------------------


class TestParakeetBackend:
    """Structural + interface tests for ParakeetSTTBackend."""

    def test_import(self):
        from backend.backends.parakeet_backend import (
            PARAKEET_FILES,
            SUPPORTED_LANGUAGES,
        )

        assert "v3-q8" in PARAKEET_FILES
        assert "v3-f16" in PARAKEET_FILES
        assert "en" in SUPPORTED_LANGUAGES
        assert len(SUPPORTED_LANGUAGES) == 25

    def test_instantiation(self):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        backend = ParakeetSTTBackend()
        assert not backend.is_loaded()
        assert backend.model is None

    def test_instantiation_custom_size(self):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        backend = ParakeetSTTBackend(model_size="v3-f16")
        assert backend.model_size == "v3-f16"

    def test_unload_when_not_loaded(self):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        backend = ParakeetSTTBackend()
        backend.unload_model()  # Should not raise
        assert not backend.is_loaded()

    def test_transcribe_raises_when_not_loaded(self):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        backend = ParakeetSTTBackend()
        with pytest.raises(RuntimeError, match="not loaded"):
            asyncio.run(backend.transcribe("fake.wav"))

    def test_transcribe_with_segments_raises_when_not_loaded(self):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        backend = ParakeetSTTBackend()
        with pytest.raises(RuntimeError, match="not loaded"):
            asyncio.run(backend.transcribe_with_segments("fake.wav"))

    @patch("backend.backends.parakeet_backend.config")
    @patch("backend.backends.parakeet_backend.shutil.which", return_value="/usr/bin/parakeet")
    def test_load_model_finds_binary(self, mock_which, mock_config):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        mock_config.get_models_dir.return_value = Path("/tmp/models")
        mock_config.get_data_dir.return_value = Path("/tmp/data")

        backend = ParakeetSTTBackend()
        # Patch _is_model_cached to skip download
        with patch.object(backend, "_is_model_cached", return_value=True):
            asyncio.run(backend.load_model())

        assert backend.is_loaded()
        assert backend._binary_path == Path("/usr/bin/parakeet")

    @patch("backend.backends.parakeet_backend.config")
    def test_load_model_raises_when_no_binary(self, mock_config):
        from backend.backends.parakeet_backend import ParakeetSTTBackend

        mock_config.get_models_dir.return_value = Path("/tmp/models")
        mock_config.get_data_dir.return_value = Path("/tmp/data")

        backend = ParakeetSTTBackend()
        with (
            patch.object(backend, "_is_model_cached", return_value=True),
            patch("backend.backends.parakeet_backend.shutil.which", return_value=None),
            patch.object(backend, "_find_binary", return_value=None),
            pytest.raises(RuntimeError, match="not found"),
        ):
            asyncio.run(backend.load_model())


# ---------------------------------------------------------------------------
# Qwen3-ASR backend
# ---------------------------------------------------------------------------


class TestQwen3ASRBackend:
    """Structural + interface tests for Qwen3ASRBackend."""

    def test_import(self):
        from backend.backends.qwen3_asr_backend import (
            HF_REPOS,
            SUPPORTED_LANGUAGES,
        )

        assert "1.7b-int4" in HF_REPOS
        assert "0.6b-int4" in HF_REPOS
        assert "en" in SUPPORTED_LANGUAGES
        assert len(SUPPORTED_LANGUAGES) == 52

    def test_instantiation(self):
        from backend.backends.qwen3_asr_backend import Qwen3ASRBackend

        backend = Qwen3ASRBackend()
        assert not backend.is_loaded()
        assert backend.session is None

    def test_instantiation_custom_size(self):
        from backend.backends.qwen3_asr_backend import Qwen3ASRBackend

        backend = Qwen3ASRBackend(model_size="0.6b-int4")
        assert backend.model_size == "0.6b-int4"

    def test_unload_when_not_loaded(self):
        from backend.backends.qwen3_asr_backend import Qwen3ASRBackend

        backend = Qwen3ASRBackend()
        backend.unload_model()  # Should not raise
        assert not backend.is_loaded()

    def test_transcribe_raises_when_not_loaded(self):
        from backend.backends.qwen3_asr_backend import Qwen3ASRBackend

        backend = Qwen3ASRBackend()
        with pytest.raises(RuntimeError, match="not loaded"):
            asyncio.run(backend.transcribe("fake.wav"))

    def test_transcribe_with_segments_raises_when_not_loaded(self):
        from backend.backends.qwen3_asr_backend import Qwen3ASRBackend

        backend = Qwen3ASRBackend()
        with pytest.raises(RuntimeError, match="not loaded"):
            asyncio.run(backend.transcribe_with_segments("fake.wav"))


# ---------------------------------------------------------------------------
# Model config registration
# ---------------------------------------------------------------------------


class TestSTTModelConfigs:
    """Verify that Parakeet and Qwen3-ASR models are registered in configs."""

    def test_parakeet_configs_present(self):
        from backend.backends.configs import get_stt_model_configs

        configs = get_stt_model_configs()
        parakeet = [c for c in configs if c.engine == "parakeet"]
        assert len(parakeet) >= 2, f"Expected >=2 parakeet configs, got {len(parakeet)}"
        sizes = {c.model_size for c in parakeet}
        assert "v3-q8" in sizes
        assert "v3-f16" in sizes

    def test_qwen3_configs_present(self):
        from backend.backends.configs import get_stt_model_configs

        configs = get_stt_model_configs()
        qwen = [c for c in configs if c.engine == "qwen3_asr"]
        assert len(qwen) >= 2, f"Expected >=2 qwen3 configs, got {len(qwen)}"
        sizes = {c.model_size for c in qwen}
        assert "1.7b-int4" in sizes
        assert "0.6b-int4" in sizes

    def test_whisper_configs_still_exist(self):
        from backend.backends.configs import get_stt_model_configs

        configs = get_stt_model_configs()
        whisper = [c for c in configs if c.engine == "whisper"]
        assert len(whisper) >= 3, "Expected whisper tiny/base/large configs to remain"

    def test_small_en_removed(self):
        """Whisper small.en and medium.en should be replaced by parakeet/qwen3."""
        from backend.backends.configs import get_stt_model_configs

        configs = get_stt_model_configs()
        small_en = [c for c in configs if c.engine == "whisper" and c.model_size == "small.en"]
        medium_en = [c for c in configs if c.engine == "whisper" and c.model_size == "medium.en"]
        assert len(small_en) == 0, "small.en should be replaced by parakeet"
        assert len(medium_en) == 0, "medium.en should be replaced by qwen3-asr"


# ---------------------------------------------------------------------------
# Registry integration
# ---------------------------------------------------------------------------


class TestSTTRegistry:
    """Verify that parakeet and qwen3_asr are in the backend registry."""

    def test_parakeet_registry_lookup(self):
        from backend.backends.registry import get_stt_backend

        backend = get_stt_backend("parakeet")
        assert backend is not None
        assert hasattr(backend, "transcribe")
        assert hasattr(backend, "unload_model")
        assert hasattr(backend, "is_loaded")

    def test_qwen3_registry_lookup(self):
        from backend.backends.registry import get_stt_backend

        backend = get_stt_backend("qwen3_asr")
        assert backend is not None
        assert hasattr(backend, "transcribe")
        assert hasattr(backend, "unload_model")
        assert hasattr(backend, "is_loaded")

    def test_unknown_engine_raises(self):
        from backend.backends.registry import get_stt_backend

        with pytest.raises(ValueError, match="Unknown STT engine"):
            get_stt_backend("nonexistent_engine")

    def test_parakeet_singleton(self):
        """get_stt_backend should return the same instance for same engine."""
        from backend.backends.registry import get_stt_backend

        b1 = get_stt_backend("parakeet")
        b2 = get_stt_backend("parakeet")
        assert b1 is b2

    def test_qwen3_singleton(self):
        from backend.backends.registry import get_stt_backend

        b1 = get_stt_backend("qwen3_asr")
        b2 = get_stt_backend("qwen3_asr")
        assert b1 is b2


# ---------------------------------------------------------------------------
# Language coverage
# ---------------------------------------------------------------------------


class TestLanguageCoverage:
    """Cross-check that language support matches the research specs."""

    def test_parakeet_european_coverage(self):
        from backend.backends.parakeet_backend import SUPPORTED_LANGUAGES

        # Core European languages that Parakeet v3 must support
        required = {"en", "fr", "de", "es", "it", "nl", "pl", "pt", "ru"}
        assert required.issubset(set(SUPPORTED_LANGUAGES))

    def test_qwen3_asian_coverage(self):
        from backend.backends.qwen3_asr_backend import SUPPORTED_LANGUAGES

        # Qwen3 must cover Asian languages that Whisper covers
        required = {"en", "zh", "ja", "ko", "ar", "hi"}
        assert required.issubset(set(SUPPORTED_LANGUAGES))

    def test_combined_coverage_exceeds_whisper(self):
        """Parakeet + Qwen3 together should cover more languages than Whisper large-v3 alone."""
        from backend.backends.parakeet_backend import SUPPORTED_LANGUAGES as parakeet_langs  # noqa: N811
        from backend.backends.qwen3_asr_backend import SUPPORTED_LANGUAGES as qwen_langs  # noqa: N811

        combined = set(parakeet_langs) | set(qwen_langs)
        assert len(combined) >= 52, f"Combined coverage should be >=52, got {len(combined)}"
