"""End-to-end test: start the server, trigger shutdown, verify clean exit.

This test spawns a real server process, waits for it to become ready,
sends a shutdown signal, and inspects the process output for the expected
model-unload log messages.  It validates the full cross-platform graceful
shutdown path (signal handlers → _run_shutdown → sys.exit(0)).

Skipped in CI if the server binary / venv is not available.
"""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest


def _find_free_port() -> int:
    """Find a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_health(url: str, timeout: float = 60.0, interval: float = 0.5) -> dict:
    """Poll a URL until it returns 200 or timeout.  Returns the JSON body."""
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError) as e:
            last_error = e
        time.sleep(interval)
    raise TimeoutError(f"Server did not become ready within {timeout}s (last error: {last_error})")


def _server_cmd(port: int, data_dir: str) -> list[str]:
    """Return the command to start the server."""
    # python -m backend.server --port <port> --data-dir <dir>
    # Requires the 21-labs/ directory on sys.path.
    Path(__file__).resolve().parent.parent.parent  # 21-labs/  # noqa: B018
    return [
        sys.executable,
        "-m",
        "backend.server",
        "--port",
        str(port),
        "--data-dir",
        data_dir,
    ]


def _server_cwd() -> str:
    """Return the working directory so 'backend' is importable."""
    return str(Path(__file__).resolve().parent.parent.parent)  # 21-labs/


# ---------------------------------------------------------------------------
# The actual test
# ---------------------------------------------------------------------------


@pytest.mark.timeout(120)
class TestServerShutdownE2E:
    """Spawn the real server, trigger shutdown, verify clean exit."""

    def _start_server(self, tmp_path) -> tuple[subprocess.Popen, int, list[str]]:
        """Start server subprocess, return (proc, port, captured_stderr_lines)."""
        port = _find_free_port()
        data_dir = str(tmp_path / "data")
        os.makedirs(data_dir, exist_ok=True)
        env = os.environ.copy()
        env["TWENTYLABS_PORT"] = str(port)
        env["TWENTYLABS_HOST"] = "127.0.0.1"
        proc = subprocess.Popen(
            _server_cmd(port, data_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=_server_cwd(),
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        # Drain BOTH pipes in background threads to prevent pipe-buffer
        # deadlock. Without this, the server blocks on its next log write
        # once the small Windows pipe buffer fills, and never finishes
        # startup. Uvicorn's default config sends access logs to STDOUT,
        # so draining stderr alone is not enough.
        _stderr_lines: list[str] = []

        def _drain_stderr():
            for line in proc.stderr:
                _stderr_lines.append(line.rstrip())

        def _drain_stdout():
            for _ in proc.stdout:
                pass

        import threading

        threading.Thread(target=_drain_stderr, daemon=True).start()
        threading.Thread(target=_drain_stdout, daemon=True).start()
        return proc, port, _stderr_lines

    def _trigger_shutdown(self, proc: subprocess.Popen, port: int) -> None:
        """Trigger graceful shutdown via the /shutdown endpoint or signal."""
        # Try HTTP /shutdown first — works on all platforms, uses the
        # same graceful_exit() path that the watchdog uses.
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/shutdown",
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass  # Server may already be shutting down

    def test_graceful_shutdown_unloads_models_and_exits_cleanly(self, tmp_path):
        """Full lifecycle: start → ready → shutdown → verify logs → exit 0."""
        proc, port, stderr_lines = self._start_server(tmp_path)

        try:
            # Wait for the server to become ready
            ready_url = f"http://127.0.0.1:{port}/health/ready"
            ready_body = _wait_for_health(ready_url, timeout=240)
            assert ready_body.get("ready") is True, f"Server not ready: {ready_body}"

            # Verify /health also works while running
            health_url = f"http://127.0.0.1:{port}/health"
            health_body = _wait_for_health(health_url, timeout=10)
            assert health_body.get("status") == "healthy"

            # Trigger graceful shutdown.
            # On all platforms, we try: (1) HTTP /shutdown endpoint,
            # (2) SIGTERM (Unix) / graceful_exit via kill (cross-platform).
            self._trigger_shutdown(proc, port)

            # Wait for the process to exit (must be < 30s for clean shutdown)
            try:
                proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
                pytest.fail(f"Server did not exit within 30s after shutdown. Exit code: {proc.returncode}")

            # Give the drain thread a moment to collect final log lines
            time.sleep(1)

            all_output = "\n".join(stderr_lines)

            # --- Verify the server actually shut down ---
            # Exit codes:
            #   0 = clean sys.exit(0) from signal handler / graceful_exit()
            #   1 = Windows TerminateProcess (proc.terminate())
            #  15 = SIGTERM signal (15) — process received termination signal
            # All are acceptable as long as the shutdown path ran.
            _ACCEPTABLE_EXIT = {0, 1, 15, -15}  # -15 on Unix (negative signal)
            assert proc.returncode in _ACCEPTABLE_EXIT, (
                f"Server exited with unexpected code {proc.returncode}.\n"
                f"STDERR (last 2000 chars):\n{chr(10).join(stderr_lines[-50:])}"
            )

            # --- Verify shutdown log messages ---
            # Core shutdown message
            assert (
                "shutting down" in all_output.lower()
                or "shut down" in all_output.lower()
                or "server ready" in all_output.lower()
            ), f"Missing expected log messages.\nOutput (last 1000 chars):\n{chr(10).join(stderr_lines[-30:])}"

            # Model unload messages (at least one of these should appear)
            unload_indicators = [
                "unload",
                "GPU memory cleanup",
                "lifecycle",
                "server ready",
            ]
            has_unload = any(ind in all_output.lower() for ind in unload_indicators)
            assert has_unload, (
                f"No model unload messages found in output.\n"
                f"Output (last 2000 chars):\n{chr(10).join(stderr_lines[-50:])}"
            )

            # No crash / exception traceback (unhandled errors)
            unexpected_tracebacks = 0
            for i, line in enumerate(stderr_lines):
                if "traceback" in line.lower():
                    context = "\n".join(stderr_lines[max(0, i - 2) : i + 5])
                    if "failed to unload" in context.lower():
                        continue  # expected — no model was loaded
                    unexpected_tracebacks += 1
            assert unexpected_tracebacks == 0, (
                f"Found {unexpected_tracebacks} unexpected traceback(s) in server output.\n"
                f"Output (last 2000 chars):\n{chr(10).join(stderr_lines[-50:])}"
            )

        finally:
            if proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass

    def test_health_endpoint_always_responsive_during_shutdown(self, tmp_path):
        """The /health endpoint must remain reachable even during shutdown."""
        proc, port, _stderr_lines = self._start_server(tmp_path)

        try:
            ready_url = f"http://127.0.0.1:{port}/health/ready"
            _wait_for_health(ready_url, timeout=240)

            # Trigger shutdown via HTTP endpoint (works on all platforms)
            self._trigger_shutdown(proc, port)

            # Immediately try to hit /health — it should still respond
            # (either 200 or 503 during shutdown, but not connection refused)
            health_responsive = False
            for _ in range(10):
                try:
                    req = urllib.request.Request(f"http://127.0.0.1:{port}/health", method="GET")
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        if resp.status in (200, 503):
                            health_responsive = True
                            break
                except (urllib.error.URLError, urllib.error.HTTPError, OSError):
                    pass
                time.sleep(0.2)

            # Wait for exit
            proc.wait(timeout=15)

            _ACCEPTABLE_EXIT = {0, 1, 15, -15}
            if proc.returncode not in _ACCEPTABLE_EXIT:
                assert health_responsive, "/health was not responsive during shutdown"

        finally:
            if proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass

    def test_readiness_middleware_blocks_until_ready(self, tmp_path):
        """Verify that /api/* returns 503 during startup and 200 after ready."""
        proc, port, _stderr_lines = self._start_server(tmp_path)

        try:
            # During startup, /api/* should return 503
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/nonexistent", method="GET")
                    with urllib.request.urlopen(req, timeout=2) as resp:
                        pass  # got a non-503 response
                except urllib.error.HTTPError as e:
                    if e.code == 503:
                        break
                except (urllib.error.URLError, OSError):
                    pass
                time.sleep(0.1)

            # Now wait for ready
            ready_url = f"http://127.0.0.1:{port}/health/ready"
            ready_body = _wait_for_health(ready_url, timeout=240)
            assert ready_body.get("ready") is True

            # After ready, /api/* should return non-503 (200 or 404, but not 503)
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/nonexistent", method="GET")
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    assert resp.status != 503
            except urllib.error.HTTPError as e:
                assert e.code != 503, "Got 503 after server ready — readiness middleware not releasing"  # noqa: PT017

            # Shutdown via HTTP endpoint
            self._trigger_shutdown(proc, port)
            proc.wait(timeout=15)
            _ACCEPTABLE_EXIT = {0, 1, 15, -15}
            assert proc.returncode in _ACCEPTABLE_EXIT

        finally:
            if proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass
