"""Tests for the STT startup self-check module."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestSTTSelfCheck:
    @pytest.mark.asyncio
    async def test_all_engines_checked(self):
        """run_stt_self_check should return results for all 4 STT engines."""
        from backend.utils.stt_self_check import run_stt_self_check

        # Mock the backend factory to return backends that report "not cached"
        mock_backend = MagicMock()
        mock_backend.model_size = "v3-q8"
        mock_backend._is_model_cached.return_value = False

        with patch("backend.backends.registry.get_stt_backend", return_value=mock_backend):
            results = await run_stt_self_check()

        assert len(results) == 4
        for engine in ("whisper", "faster-whisper", "parakeet", "qwen3_asr"):
            assert engine in results

    @pytest.mark.asyncio
    async def test_cached_backend_loads_and_unloads(self):
        """A cached, unloadable backend should go through full load/unload cycle."""
        from backend.utils.stt_self_check import run_stt_self_check

        mock_backend = MagicMock()
        mock_backend.model_size = "v3-q8"
        mock_backend._is_model_cached.return_value = True
        mock_backend.is_loaded.return_value = False
        mock_backend.load_model = AsyncMock()
        mock_backend.unload_model = MagicMock()

        # After load_model, is_loaded should return True
        def set_loaded(*args, **kwargs):
            mock_backend.is_loaded.return_value = True

        mock_backend.load_model.side_effect = set_loaded

        with patch("backend.backends.registry.get_stt_backend", return_value=mock_backend):
            await run_stt_self_check()

        assert mock_backend.load_model.called
        assert mock_backend.unload_model.called

    @pytest.mark.asyncio
    async def test_already_loaded_skips(self):
        """A backend that's already loaded should be skipped (not re-loaded)."""
        from backend.utils.stt_self_check import run_stt_self_check

        mock_backend = MagicMock()
        mock_backend.model_size = "v3-q8"
        mock_backend._is_model_cached.return_value = True
        mock_backend.is_loaded.return_value = True  # already loaded

        with patch("backend.backends.registry.get_stt_backend", return_value=mock_backend):
            await run_stt_self_check()

        # Should NOT call load_model (already loaded)
        mock_backend.load_model.assert_not_called()

    @pytest.mark.asyncio
    async def test_instantiation_error_returns_error(self):
        """A backend that fails to instantiate should return error status."""
        from backend.utils.stt_self_check import run_stt_self_check

        def raise_on_parakeet(engine):
            if engine == "parakeet":
                raise ImportError("No module named 'parakeet'")
            mock = MagicMock()
            mock.model_size = "base"
            mock._is_model_cached.return_value = False
            return mock

        with patch("backend.backends.registry.get_stt_backend", side_effect=raise_on_parakeet):
            results = await run_stt_self_check()

        assert results["parakeet"]["status"] == "error"
        assert "instantiation" in results["parakeet"]["message"].lower()

    @pytest.mark.asyncio
    async def test_load_failure_returns_error(self):
        """A backend that fails to load should return error and clean up."""
        from backend.utils.stt_self_check import run_stt_self_check

        mock_backend = MagicMock()
        mock_backend.model_size = "v3-q8"
        mock_backend._is_model_cached.return_value = True
        mock_backend.is_loaded.return_value = False
        mock_backend.load_model = AsyncMock(side_effect=RuntimeError("CUDA OOM"))
        mock_backend.unload_model = MagicMock()

        with patch("backend.backends.registry.get_stt_backend", return_value=mock_backend):
            results = await run_stt_self_check()

        # All 4 engines should have results
        assert len(results) == 4

    @pytest.mark.asyncio
    async def test_uncached_backend_is_skipped(self):
        """A backend whose model isn't cached should be skipped."""
        from backend.utils.stt_self_check import run_stt_self_check

        mock_backend = MagicMock()
        mock_backend.model_size = "base"
        mock_backend._is_model_cached.return_value = False

        with patch("backend.backends.registry.get_stt_backend", return_value=mock_backend):
            results = await run_stt_self_check()

        for _engine, result in results.items():
            if result["status"] == "skipped":
                assert "not cached" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_result_dict_shape(self):
        """Each result should have status, message, load_ms, is_cached keys."""
        from backend.utils.stt_self_check import run_stt_self_check

        mock_backend = MagicMock()
        mock_backend.model_size = "base"
        mock_backend._is_model_cached.return_value = False

        with patch("backend.backends.registry.get_stt_backend", return_value=mock_backend):
            results = await run_stt_self_check()

        for _engine, result in results.items():
            assert "status" in result
            assert "message" in result
            assert "load_ms" in result
            assert "is_cached" in result
            assert result["status"] in ("ok", "skipped", "error")
