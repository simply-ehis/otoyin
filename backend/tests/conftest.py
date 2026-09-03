"""
Shared fixtures and path setup for backend tests.

Adds the **repo root** so ``backend`` is importable as a package (matching
``python -m backend.main``), and the **backend dir** so older direct imports
(``from utils.progress import ...``) still resolve.
"""

import sys
from pathlib import Path

import pytest

BACKEND_DIR = str(Path(__file__).parent.parent)  # backend/
REPO_ROOT = str(Path(__file__).parent.parent.parent)  # repo root

for p in [BACKEND_DIR, REPO_ROOT]:
    if p not in sys.path:
        sys.path.insert(0, p)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset the singleton rate limiter state between tests."""
    yield
    try:
        from backend.services.rate_limiter import _realtime_limiter, _voice_chat_limiter

        for limiter in (_voice_chat_limiter, _realtime_limiter):
            limiter._global_sessions = 0
            limiter._client_states.clear()
            limiter._processing_count = 0
    except Exception:
        pass


def _kill_stray_backend_servers() -> None:
    """Kill orphaned ``backend.server --port`` processes from killed sessions.

    Best-effort only: any lookup/kill failure is swallowed so the suite
    never fails because of this cleanup.
    """
    import os
    import subprocess
    import sys

    me = os.getpid()
    try:
        if sys.platform == "win32":
            out = subprocess.check_output(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*backend.server*--port*' } | Select-Object -ExpandProperty ProcessId",
                ],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=30,
            )
            pids = [int(line.strip()) for line in out.splitlines() if line.strip().isdigit()]
        else:
            out = subprocess.check_output(
                ["pgrep", "-f", "backend.server.*--port"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=30,
            )
            pids = [int(line.strip()) for line in out.splitlines() if line.strip().isdigit()]
    except Exception:
        return
    for pid in pids:
        if pid == me:
            continue
        try:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=30,
                )
            else:
                os.kill(pid, 9)
        except Exception:
            continue


@pytest.fixture(scope="session", autouse=True)
def _cleanup_stray_servers():
    """Remove stray backend servers before the suite runs (see above)."""
    _kill_stray_backend_servers()
    return
