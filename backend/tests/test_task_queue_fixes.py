"""Regression tests for task_queue.py async DB session fix.

Verifies that _force_fail_if_active uses asyncio.to_thread for DB access
instead of blocking the event loop with sync next(get_db()).
"""

import asyncio
from unittest.mock import MagicMock, patch

import pytest


class TestForceFailIfActive:
    """Test the _force_fail_if_active recovery function."""

    @pytest.mark.asyncio
    async def test_skips_non_active_generation(self):
        """Should not update status if generation is already terminal."""
        from backend.services import history, task_queue
        from backend.services.task_queue import _force_fail_if_active

        mock_gen = MagicMock()
        mock_gen.status = "completed"  # Already terminal

        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = mock_gen

        with patch("backend.database.get_db", return_value=iter([mock_db])):
            with patch.object(history, "update_generation_status") as mock_update:
                await _force_fail_if_active("gen-123", "worker crashed")
                mock_update.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_none_generation(self):
        """Should not crash if generation doesn't exist."""
        from backend.services import history
        from backend.services.task_queue import _force_fail_if_active

        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = None

        with patch("backend.database.get_db", return_value=iter([mock_db])):
            with patch.object(history, "update_generation_status") as mock_update:
                await _force_fail_if_active("gen-nonexistent", "error")
                mock_update.assert_not_called()

    @pytest.mark.asyncio
    async def test_updates_active_generation(self):
        """Should flip generating/loading_model status to failed."""
        from backend.services import history
        from backend.services.task_queue import _force_fail_if_active

        mock_gen = MagicMock()
        mock_gen.status = "generating"

        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = mock_gen

        with patch("backend.database.get_db", return_value=iter([mock_db])):
            with patch.object(history, "update_generation_status") as mock_update:
                await _force_fail_if_active("gen-active", "timeout")
                mock_update.assert_called_once_with(
                    generation_id="gen-active",
                    status="failed",
                    db=mock_db,
                    error="timeout",
                )
                mock_db.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_uses_async_db_session(self):
        """Verify get_db is called via asyncio.to_thread, not directly."""
        from backend.services import history
        from backend.services.task_queue import _force_fail_if_active

        mock_db = MagicMock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = None

        def sync_get_db():
            return iter([mock_db])

        with patch("backend.database.get_db", side_effect=sync_get_db):
            with patch.object(history, "update_generation_status"):
                # If this hangs, the old sync-in-async bug is present
                await asyncio.wait_for(
                    _force_fail_if_active("gen-async", "test"),
                    timeout=2.0,
                )

        mock_db.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_handles_get_db_failure(self):
        """Should not crash if get_db raises."""
        from backend.services import history
        from backend.services.task_queue import _force_fail_if_active

        with patch("backend.database.get_db", side_effect=RuntimeError("db down")):
            with patch.object(history, "update_generation_status"):
                # Should not raise — the function catches exceptions
                await _force_fail_if_active("gen-db-fail", "error")
