"""Tests for cross-platform graceful shutdown."""

import os
import signal
import sys
from unittest.mock import MagicMock, patch

import pytest


class TestInstallSignalHandlers:
    """Verify _install_signal_handlers installs SIGTERM/SIGINT handlers."""

    def test_installs_sigterm_handler(self):
        from backend.app import _install_signal_handlers, _shutdown_event

        _shutdown_event.clear()
        _install_signal_handlers()
        handler = signal.getsignal(signal.SIGTERM)
        # Should be our custom handler (not SIG_DFL or SIG_IGN)
        assert handler not in (signal.SIG_DFL, signal.SIG_IGN)

    def test_installs_sigint_handler(self):
        from backend.app import _install_signal_handlers, _shutdown_event

        _shutdown_event.clear()
        _install_signal_handlers()
        handler = signal.getsignal(signal.SIGINT)
        assert handler not in (signal.SIG_DFL, signal.SIG_IGN)

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only")
    def test_installs_sigbreak_on_windows(self):
        from backend.app import _install_signal_handlers, _shutdown_event

        _shutdown_event.clear()
        _install_signal_handlers()
        handler = signal.getsignal(signal.SIGBREAK)
        assert handler not in (signal.SIG_DFL, signal.SIG_IGN)

    def test_idempotent(self):
        from backend.app import _install_signal_handlers, _shutdown_event

        _shutdown_event.clear()
        _install_signal_handlers()
        h1 = signal.getsignal(signal.SIGTERM)
        assert callable(h1) and h1 not in (signal.SIG_DFL, signal.SIG_IGN)
        # Second call should not crash and should still be a valid handler
        _install_signal_handlers()
        h2 = signal.getsignal(signal.SIGTERM)
        assert callable(h2) and h2 not in (signal.SIG_DFL, signal.SIG_IGN)


class TestShutdownEvent:
    """Verify the shutdown event coordinates shutdown once."""

    def test_event_starts_cleared(self):
        from backend.app import _shutdown_event

        _shutdown_event.clear()
        assert not _shutdown_event.is_set()

    def test_event_set_prevents_double_shutdown(self):
        from backend.app import _shutdown_event

        _shutdown_event.set()
        assert _shutdown_event.is_set()
        _shutdown_event.clear()


class TestServerReference:
    """Verify the uvicorn server reference getter/setter."""

    def test_set_and_get(self):
        from backend.app import _get_uvicorn_server, _set_uvicorn_server

        mock_server = MagicMock()
        _set_uvicorn_server(mock_server)
        assert _get_uvicorn_server() is mock_server
        # Clean up
        _set_uvicorn_server(None)


class TestGracefulExit:
    """Test the graceful_exit function (unit-level, no actual process exit)."""

    def test_noop_if_already_shutting_down(self):
        from backend.app import _shutdown_event, graceful_exit

        _shutdown_event.set()
        # Should return immediately without doing anything
        graceful_exit()
        # Clean up
        _shutdown_event.clear()

    @pytest.mark.skipif(sys.platform == "win32", reason="Unix-only test")
    @patch("backend.app.sys.exit")
    @patch("backend.app.os.kill")
    def test_unix_uses_sigterm(self, mock_kill, mock_exit):
        from backend.app import _shutdown_event, graceful_exit

        _shutdown_event.clear()
        graceful_exit()
        mock_kill.assert_called_once()
        call_args = mock_kill.call_args
        assert call_args[0][0] == os.getpid()
        assert call_args[0][1] == signal.SIGTERM
        _shutdown_event.clear()

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only")
    def test_windows_sets_server_should_exit_when_loop_running(self):
        """On Windows with running event loop, graceful_exit sets server.should_exit."""
        from backend.app import _set_uvicorn_server, _shutdown_event, graceful_exit

        mock_server = MagicMock()
        mock_server.should_exit = False
        _set_uvicorn_server(mock_server)
        _shutdown_event.clear()

        # Simulate a running event loop
        with patch("backend.app.asyncio") as mock_asyncio:
            loop = MagicMock()
            loop.is_running.return_value = True
            mock_asyncio.get_event_loop.return_value = loop

            graceful_exit()

            assert mock_server.should_exit is True
            mock_server.should_exit = False  # clean up

        _set_uvicorn_server(None)
        _shutdown_event.clear()
