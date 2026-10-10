"""Process supervisor for the otoyin backend.

Runs uvicorn as a managed child process with:
- Health-check polling (liveness probe)
- Auto-restart on crash with exponential backoff
- Graceful shutdown forwarding
- OOM pressure monitoring with model unload before Windows OOM killer

Usage:
    python -m backend.supervisor [--port 17493] [--host 127.0.0.1]
    python -m backend.supervisor --no-restart   # single-shot, no auto-restart
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

logger = logging.getLogger("supervisor")

# ── Configuration ──────────────────────────────────────────────────────────
HEALTH_POLL_INTERVAL = 5  # seconds between health checks
HEALTH_TIMEOUT = 3  # seconds to wait for /health/live response
MAX_BACKOFF = 60  # max seconds between restart attempts
BACKOFF_MULTIPLIER = 2  # exponential backoff factor
MAX_CONSECUTIVE_FAILURES = 5  # restart attempts before entering cooldown
COOLDOWN_SECONDS = 300  # 5-minute cooldown after MAX_CONSECUTIVE_FAILURES
STARTUP_GRACE = 15  # seconds to wait before first health check after start
MEMORY_HIGH_WATER_MB = 6144  # start unloading models above this
MEMORY_CRITICAL_MB = 7168  # force-unload all models above this


def _get_venv_python() -> str:
    """Find the venv python executable.

    The venv lives next to this package (``backend/venv``), not at the repo
    root. Checking only the repo root made the supervisor fall back to the
    system interpreter, which has none of the engine deps (kokoro_onnx etc.)
    and every model load 500'd.
    """
    backend_dir = Path(__file__).resolve().parent
    candidates = [
        backend_dir / "venv" / "Scripts" / "python.exe",
        backend_dir / "venv" / "bin" / "python",
        backend_dir.parent / "venv" / "Scripts" / "python.exe",
        backend_dir.parent / "venv" / "bin" / "python",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    # Fallback to system python
    return sys.executable


def _get_backend_args(host: str, port: int, extra: list[str] | None = None) -> list[str]:
    """Build the uvicorn command-line arguments."""
    python = _get_venv_python()
    cmd = [
        python,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        host,
        "--port",
        str(port),
        "--log-level",
        "info",
    ]
    if extra:
        cmd.extend(extra)
    return cmd


def _check_health(host: str, port: int) -> bool:
    """Poll /health/live to verify the backend is alive and accepting requests.

    Returns True if the endpoint responds with 200, False otherwise.
    Uses only stdlib (no requests/urllib3 dependency).
    """
    import urllib.error
    import urllib.request

    url = f"http://{host}:{port}/health/live"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=HEALTH_TIMEOUT) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def _get_process_memory_mb() -> float | None:
    """Get current process RSS in MB (cross-platform)."""
    try:
        if sys.platform == "win32":
            import ctypes

            kernel32 = ctypes.windll.kernel32
            process_query_limited = 0x1000
            handle = kernel32.OpenProcess(process_query_limited, False, os.getpid())
            if not handle:
                return None
            try:
                # GetProcessMemoryInfo requires psapi
                class ProcessMemoryCounters(ctypes.Structure):
                    _fields_ = [
                        ("cb", ctypes.c_ulong),
                        ("PageFaultCount", ctypes.c_ulong),
                        ("PeakWorkingSetSize", ctypes.c_size_t),
                        ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t),
                        ("PeakPagefileUsage", ctypes.c_size_t),
                    ]

                counters = ProcessMemoryCounters()
                counters.cb = ctypes.sizeof(counters)
                psapi = ctypes.windll.psapi
                if psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                    return counters.WorkingSetSize / (1024 * 1024)
            finally:
                kernel32.CloseHandle(handle)
        else:
            import resource

            usage = resource.getrusage(resource.RUSAGE_SELF)
            # ru_maxrss is in KB on Linux, bytes on macOS
            if sys.platform == "darwin":
                return usage.ru_maxrss / (1024 * 1024)
            return usage.ru_maxrss / 1024
    except Exception:
        logger.debug("Memory measurement failed", exc_info=True)
    return None


def _check_memory_pressure(host: str, port: int) -> str | None:
    """Check system memory pressure and trigger model unload if needed.

    Returns:
        None if OK, "high" if models should be unloaded, "critical" if
        we should force-unload everything.
    """
    try:
        import psutil

        mem = psutil.virtual_memory()
        used_mb = mem.used / (1024 * 1024)
        total_mb = mem.total / (1024 * 1024)
        percent = mem.percent

        if percent > 90 or used_mb > MEMORY_CRITICAL_MB:
            logger.warning(
                "Memory CRITICAL: %.0f%% used (%.0f MB / %.0f MB)",
                percent,
                used_mb,
                total_mb,
            )
            return "critical"
        if percent > 80 or used_mb > MEMORY_HIGH_WATER_MB:
            logger.warning(
                "Memory HIGH: %.0f%% used (%.0f MB / %.0f MB)",
                percent,
                used_mb,
                total_mb,
            )
            return "high"
    except ImportError:
        # psutil not installed — fall back to basic check
        pass
    except Exception:
        logger.debug("Memory pressure check failed", exc_info=True)
    return None


def _trigger_model_unload(host: str, port: int, level: str) -> bool:
    """Send POST /models/unload-all to the backend to free memory."""
    import urllib.error
    import urllib.request

    url = f"http://{host}:{port}/models/unload-all"
    try:
        req = urllib.request.Request(url, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        logger.warning("Model unload request failed: %s", e)
        return False


class Supervisor:
    """Manages the backend uvicorn process with health monitoring and auto-restart."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 17493,
        auto_restart: bool = True,
        reload: bool = False,
    ):
        self.host = host
        self.port = port
        self.auto_restart = auto_restart
        self.reload = reload
        self._process: subprocess.Popen | None = None
        self._shutdown = threading.Event()
        self._consecutive_failures = 0
        self._total_restarts = 0
        self._last_start_time = 0.0
        self._memory_check_thread: threading.Thread | None = None

    def run(self) -> int:
        """Run the supervisor loop. Returns exit code."""
        logger.info(
            "Supervisor starting — backend on %s:%d, auto-restart=%s",
            self.host,
            self.port,
            self.auto_restart,
        )

        # Install signal handlers
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, self._handle_signal)
        if sys.platform == "win32":
            signal.signal(signal.SIGBREAK, self._handle_signal)

        # Start memory pressure monitor
        if self.auto_restart:
            self._memory_check_thread = threading.Thread(target=self._memory_watch_loop, daemon=True)
            self._memory_check_thread.start()

        # Main supervisor loop
        while not self._shutdown.is_set():
            exit_code = self._start_backend()
            self._consecutive_failures += 1
            self._total_restarts += 1

            if exit_code == 0:
                # Clean exit — don't restart
                logger.info("Backend exited cleanly (code 0)")
                return 0

            if not self.auto_restart:
                logger.error("Backend exited with code %d (auto-restart disabled)", exit_code)
                return exit_code

            if self._consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                logger.error(
                    "Backend failed %d times in a row — entering %ds cooldown",
                    self._consecutive_failures,
                    COOLDOWN_SECONDS,
                )
                if self._shutdown.wait(timeout=COOLDOWN_SECONDS):
                    return 0
                self._consecutive_failures = 0

            backoff = min(
                MAX_BACKOFF,
                BACKOFF_MULTIPLIER**self._consecutive_failures,
            )
            logger.info(
                "Restarting in %ds (attempt %d, total restarts: %d)...",
                backoff,
                self._consecutive_failures,
                self._total_restarts,
            )
            if self._shutdown.wait(timeout=backoff):
                return 0

        return 0

    def _start_backend(self) -> int:
        """Start the backend process and wait for it to exit or become unhealthy."""
        cmd = _get_backend_args(
            self.host,
            self.port,
            ["--reload"] if self.reload else [],
        )
        logger.info("Starting backend: %s", " ".join(cmd))

        try:
            self._process = subprocess.Popen(
                cmd,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            self._last_start_time = time.monotonic()
            self._consecutive_failures = 0  # reset on successful start
        except OSError as e:
            logger.error("Failed to start backend: %s", e)
            return 1

        # Wait for startup grace period
        logger.info("Waiting %ds for backend startup...", STARTUP_GRACE)
        if self._shutdown.wait(timeout=STARTUP_GRACE):
            self._kill_backend()
            return 0

        # Health check loop
        while not self._shutdown.is_set():
            if self._process.poll() is not None:
                exit_code = self._process.returncode
                logger.warning("Backend process exited (code %d)", exit_code)
                return exit_code

            if _check_health(self.host, self.port):
                # Backend is healthy — wait and check again
                if self._shutdown.wait(timeout=HEALTH_POLL_INTERVAL):
                    self._kill_backend()
                    return 0
            else:
                # Health check failed — could be a hang or slow startup
                logger.warning("Health check failed — waiting for recovery...")
                # Give it a few more chances before killing
                recovered = False
                for _ in range(6):  # 30 seconds total
                    if self._shutdown.wait(timeout=5):
                        self._kill_backend()
                        return 0
                    if self._process.poll() is not None:
                        exit_code = self._process.returncode
                        logger.warning("Backend process exited (code %d)", exit_code)
                        return exit_code
                    if _check_health(self.host, self.port):
                        recovered = True
                        break

                if not recovered:
                    logger.error("Backend unhealthy for 30s — killing and restarting")
                    self._kill_backend()
                    return 1  # non-zero to trigger restart

        self._kill_backend()
        return 0

    def _kill_backend(self) -> None:
        """Gracefully stop the backend process."""
        if self._process is None or self._process.poll() is not None:
            return

        pid = self._process.pid
        logger.info("Stopping backend (PID %d)...", pid)

        # Try graceful shutdown via HTTP first
        import urllib.error
        import urllib.request

        try:
            url = f"http://{self.host}:{self.port}/shutdown"
            req = urllib.request.Request(url, method="POST")
            urllib.request.urlopen(req, timeout=5)
            # Wait for graceful exit
            try:
                self._process.wait(timeout=10)
                logger.info("Backend stopped gracefully")
                return
            except subprocess.TimeoutExpired:
                pass
        except (urllib.error.URLError, OSError):
            pass

        # Try SIGTERM to stop the process gracefully
        try:
            self._process.terminate()
            self._process.wait(timeout=5)
            logger.info("Backend stopped via SIGTERM")
            return
        except subprocess.TimeoutExpired:
            pass

        # Last resort: force kill
        try:
            self._process.kill()
            self._process.wait(timeout=3)
            logger.warning("Backend force-killed")
        except Exception:
            pass

    def _handle_signal(self, signum, frame) -> None:
        """Handle shutdown signals."""
        sig_name = signal.Signals(signum).name
        logger.info("Supervisor received %s — shutting down", sig_name)
        self._shutdown.set()
        self._kill_backend()

    def _memory_watch_loop(self) -> None:
        """Background thread that monitors memory pressure and triggers model unload."""
        while not self._shutdown.is_set():
            if self._shutdown.wait(timeout=30):
                return

            if self._process is None or self._process.poll() is not None:
                continue

            pressure = _check_memory_pressure(self.host, self.port)
            if pressure:
                _trigger_model_unload(self.host, self.port, pressure)


def main() -> int:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="otoyin backend supervisor")
    parser.add_argument(
        "--host",
        default=os.environ.get("OTOYIN_HOST") or os.environ.get("TWENTYLABS_HOST", "127.0.0.1"),
        help="Backend host",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("OTOYIN_PORT") or os.environ.get("TWENTYLABS_PORT", "17493")),
        help="Backend port",
    )
    parser.add_argument(
        "--no-restart",
        action="store_true",
        help="Disable auto-restart on crash",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable uvicorn hot-reload (dev mode)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [supervisor] %(levelname)s: %(message)s",
        stream=sys.stderr,
    )

    supervisor = Supervisor(
        host=args.host,
        port=args.port,
        auto_restart=not args.no_restart,
        reload=args.reload,
    )
    return supervisor.run()


if __name__ == "__main__":
    sys.exit(main())
