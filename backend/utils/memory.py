"""Memory pressure monitoring — log warnings before OOM kills.

On low-RAM systems (<=8GB), the OS may OOM-kill the python process during
model loading.  This module provides a pre-flight check that logs a warning
and returns False when free memory is critically low, so callers can skip
the load or fall back to a lighter path.

All functions are no-ops on platforms without psutil (graceful degradation).
"""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)

# Memory thresholds in megabytes for warnings and critical pressure.
_WARN_MB = 512  # warn when free memory drops below this
_CRIT_MB = 256  # refuse to load when free memory is below this

# Cached values (refreshed every N calls to avoid syscall spam)
_free_mb: int | None = None
_call_count = 0
_REFRESH_EVERY = 20  # re-read memory stats every N calls


def _read_free_mb() -> int:
    """Read free physical memory via psutil, then platform-specific fallbacks."""
    try:
        import psutil

        return int(psutil.virtual_memory().available / (1024 * 1024))
    except ImportError:
        pass
    if sys.platform == "win32":
        try:
            import subprocess

            out = subprocess.check_output(
                ["wmic", "OS", "get", "FreePhysicalMemory", "/value"],
                text=True,
                timeout=3,
                stderr=subprocess.DEVNULL,
            )
            for line in out.splitlines():
                if line.startswith("FreePhysicalMemory="):
                    return int(line.split("=", 1)[1]) // 1024  # KB → MB
        except Exception:
            logger.debug("suppressed exception in memory.py wmic fallback", exc_info=True)
    elif sys.platform == "darwin":
        try:
            import subprocess

            out = subprocess.check_output(
                ["vm_stat"],
                text=True,
                timeout=3,
                stderr=subprocess.DEVNULL,
            )
            free_pages = 0
            for line in out.splitlines():
                if "Pages free:" in line:
                    free_pages = int(line.split(":")[1].strip().strip("."))
                    break
            return free_pages * 4096 // (1024 * 1024)  # page size 4096, bytes → MB
        except Exception:
            logger.debug("suppressed exception in memory.py macOS fallback", exc_info=True)
    else:
        # Linux: read /proc/meminfo with explicit UTF-8 encoding
        try:
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("MemAvailable:"):
                        kb = int(line.split()[1])
                        return kb // 1024  # KB → MB
        except (FileNotFoundError, PermissionError, ValueError):
            logger.debug("suppressed exception in memory.py /proc/meminfo", exc_info=True)
    return -1  # unknown


def available_mb() -> int:
    """Return free physical memory in MB (cached, refreshes every 20 calls)."""
    global _free_mb, _call_count
    _call_count += 1
    if _free_mb is None or _call_count % _REFRESH_EVERY == 0:
        _free_mb = _read_free_mb()
    return _free_mb


def is_memory_ok(min_free_mb: int = 0) -> bool:
    """Return True if there is enough free memory.

    Args:
        min_free_mb: minimum required free MB.  Defaults to _CRIT_MB.
    """
    free = available_mb()
    if free < 0:
        return True  # unknown — don't block
    threshold = min_free_mb if min_free_mb > 0 else _CRIT_MB
    return free >= threshold


def check_memory(label: str = "operation", required_mb: int = 256) -> bool:
    """Log a warning/critical and return False if memory is too low.

    Call this before loading a model or running a heavy operation.
    Returns True if safe to proceed.
    """
    free = available_mb()
    if free < 0:
        return True  # can't measure — proceed

    if free < _CRIT_MB:
        logger.error(
            "CRITICAL memory pressure: %dMB free (threshold %dMB) — skipping %s to avoid OOM kill",
            free,
            _CRIT_MB,
            label,
        )
        return False
    if free < _WARN_MB:
        logger.warning(
            "Low memory: %dMB free (warn at %dMB) — %s may cause OOM",
            free,
            _WARN_MB,
            label,
        )
    return True


def get_system_total_mb() -> int:
    """Return total physical memory in MB."""
    try:
        import psutil

        return int(psutil.virtual_memory().total / (1024 * 1024))
    except ImportError:
        pass
    if sys.platform == "win32":
        try:
            import subprocess

            out = subprocess.check_output(
                ["wmic", "computerhost", "get", "TotalPhysicalMemory", "/value"],
                text=True,
                timeout=3,
                stderr=subprocess.DEVNULL,
            )
            for line in out.splitlines():
                if line.startswith("TotalPhysicalMemory="):
                    return int(line.split("=", 1)[1]) // (1024 * 1024)
        except Exception:
            logger.debug("suppressed exception in memory.py wmic total", exc_info=True)
    elif sys.platform == "darwin":
        try:
            import subprocess

            out = subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"],
                text=True,
                timeout=3,
                stderr=subprocess.DEVNULL,
            )
            return int(out.strip()) // (1024 * 1024)
        except Exception:
            logger.debug("suppressed exception in memory.py macOS total", exc_info=True)
    else:
        # Linux: read /proc/meminfo with explicit UTF-8 encoding
        try:
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return kb // 1024  # KB → MB
        except (FileNotFoundError, PermissionError, ValueError):
            logger.debug("suppressed exception in memory.py /proc/meminfo total", exc_info=True)
    return -1
