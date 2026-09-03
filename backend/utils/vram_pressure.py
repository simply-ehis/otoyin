"""GPU VRAM pressure detector.

Prevents out-of-memory crashes by checking available GPU memory before
loading a model.  When VRAM is critically low, the detector:

1. Attempts to unload idle models via the lifecycle manager
2. If still under pressure, waits (with timeout) for memory to free up
3. Raises ``VRAMInsufficientError`` if memory never recovers

Supports CUDA, XPU, and DirectML.  On CPU-only hosts the detector is a
no-op (always returns OK).

Design
------
The detector is *conservative*: it checks *before* the load and estimates
the incoming model's footprint from ``ModelConfig.size_mb``.  VRAM
measurement uses ``torch.cuda.mem_get_info()`` (total - free = used) which
accounts for both PyTorch's allocator and external allocations (ONNX Runtime,
CUDA context overhead).

Threshold defaults to 20% free VRAM — below this, new loads are blocked.
The threshold can be overridden via ``TWENTYLABS_VRAM_THRESHOLD`` env var
(e.g. ``0.15`` for 15%).
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .model_lifecycle import ModelLifecycleManager

logger = logging.getLogger(__name__)

# Lazy references — resolved on first use to avoid circular imports.
_lifecycle_manager: ModelLifecycleManager | None = None
_cleanup_gpu_memory = None


def _get_lifecycle_manager():
    global _lifecycle_manager
    if _lifecycle_manager is None:
        from .model_lifecycle import lifecycle_manager

        _lifecycle_manager = lifecycle_manager
    return _lifecycle_manager


def _get_cleanup_gpu_memory():
    global _cleanup_gpu_memory
    if _cleanup_gpu_memory is None:
        from ..backends.base import cleanup_gpu_memory

        _cleanup_gpu_memory = cleanup_gpu_memory
    return _cleanup_gpu_memory


# Minimum fraction of total VRAM that must remain free after a load.
# Below this, new model loads are blocked until memory recovers.
_DEFAULT_VRAM_THRESHOLD = 0.20  # 20%

# How long to wait for VRAM to free up before giving up (seconds).
_WAIT_TIMEOUT_SECONDS = 30.0

# Polling interval while waiting for VRAM recovery (seconds).
_WAIT_POLL_INTERVAL = 1.0


def _get_threshold() -> float:
    """Return the VRAM pressure threshold (0.0-1.0).

    Reads ``TWENTYLABS_VRAM_THRESHOLD`` from the environment each call so
    tests can monkeypatch ``os.environ`` without module-level caching.
    """
    raw = os.environ.get("TWENTYLABS_VRAM_THRESHOLD")
    if raw is not None:
        try:
            val = float(raw)
            return max(0.05, min(0.50, val))  # clamp 5%-50%
        except ValueError:
            pass
    return _DEFAULT_VRAM_THRESHOLD


@dataclass(frozen=True)
class VRAMStatus:
    """Snapshot of GPU memory state."""

    available: bool  # True if a GPU is detected
    total_mb: float  # Total VRAM in MB (0 if no GPU)
    used_mb: float  # Currently used VRAM in MB
    free_mb: float  # Free VRAM in MB
    percent_free: float  # free / total (0.0-1.0, 1.0 if no GPU)
    pressure: bool  # True if below threshold (loading may fail)
    device_name: str | None = None  # GPU name


class VRAMInsufficientError(Exception):
    """Raised when VRAM is insufficient and the load cannot proceed."""

    def __init__(self, required_mb: float, free_mb: float, total_mb: float, threshold: float):
        self.required_mb = required_mb
        self.free_mb = free_mb
        self.total_mb = total_mb
        self.threshold = threshold
        pct = (free_mb / total_mb * 100) if total_mb > 0 else 0
        super().__init__(
            f"VRAM insufficient: need ~{required_mb:.0f} MB but only "
            f"{free_mb:.0f} MB free ({pct:.1f}% of {total_mb:.0f} MB total, "
            f"threshold={threshold * 100:.0f}%)"
        )


def get_vram_status() -> VRAMStatus:
    """Probe current GPU memory and return a status snapshot.

    Thread-safe — calls ``torch.cuda.mem_get_info()`` which is GIL-safe.
    Cached result is NOT reused because VRAM changes rapidly.
    """
    try:
        import torch

        # --- CUDA ---
        if torch.cuda.is_available():
            device = torch.cuda.current_device()
            total_bytes, free_bytes = torch.cuda.mem_get_info(device)
            total_mb = total_bytes / (1024 * 1024)
            free_mb = free_bytes / (1024 * 1024)
            used_mb = total_mb - free_mb
            percent_free = free_mb / total_mb if total_mb > 0 else 1.0
            device_name = torch.cuda.get_device_name(device)
            threshold = _get_threshold()
            return VRAMStatus(
                available=True,
                total_mb=total_mb,
                used_mb=used_mb,
                free_mb=free_mb,
                percent_free=percent_free,
                pressure=percent_free < threshold,
                device_name=device_name,
            )

        # --- XPU (Intel) ---
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            device = torch.xpu.current_device()
            total_bytes = torch.xpu.get_device_properties(device).total_mem
            allocated = torch.xpu.memory_allocated(device)
            total_mb = total_bytes / (1024 * 1024)
            used_mb = allocated / (1024 * 1024)
            free_mb = total_mb - used_mb
            percent_free = free_mb / total_mb if total_mb > 0 else 1.0
            device_name = torch.xpu.get_device_name(device)
            threshold = _get_threshold()
            return VRAMStatus(
                available=True,
                total_mb=total_mb,
                used_mb=used_mb,
                free_mb=free_mb,
                percent_free=percent_free,
                pressure=percent_free < threshold,
                device_name=device_name,
            )

    except ImportError:
        pass
    except Exception as e:
        logger.debug("VRAM probe failed: %s", e)

    # No GPU or probe failed — report as no pressure
    return VRAMStatus(
        available=False,
        total_mb=0,
        used_mb=0,
        free_mb=0,
        percent_free=1.0,
        pressure=False,
    )


def check_vram_pressure(required_mb: float = 0) -> tuple[bool, VRAMStatus]:
    """Check if there's enough VRAM to load a model.

    Args:
        required_mb: Estimated VRAM needed by the incoming model (from ModelConfig.size_mb).

    Returns:
        (ok, status) — ``ok`` is True if loading can proceed safely.
    """
    status = get_vram_status()

    if not status.available:
        return True, status  # CPU-only — always OK

    threshold = _get_threshold()
    min_free_mb = status.total_mb * threshold

    # VRAM must have room for both the threshold reserve AND the new model
    needed_free = min_free_mb + required_mb
    ok = status.free_mb >= needed_free

    if not ok:
        logger.warning(
            "VRAM pressure detected: free=%.0f MB, need ~%.0f MB for model + %.0f MB reserve (%.0f%% of %.0f MB total)",
            status.free_mb,
            required_mb,
            min_free_mb,
            threshold * 100,
            status.total_mb,
        )

    return ok, status


async def wait_for_vram(
    required_mb: float = 0,
    timeout: float | None = None,
    on_pressure_callback=None,
) -> VRAMStatus:
    """Wait until there's enough VRAM, or raise ``VRAMInsufficientError``.

    Before waiting, attempts to free memory by requesting idle engine unload
    via the lifecycle manager.

    Args:
        required_mb: Estimated VRAM needed by the incoming model.
        timeout: Max seconds to wait (default: ``_WAIT_TIMEOUT_SECONDS``).
        on_pressure_callback: Optional async callable invoked once when
            pressure is first detected (e.g. to notify the frontend).

    Returns:
        ``VRAMStatus`` once memory is available.

    Raises:
        VRAMInsufficientError: If timeout expires without recovery.
    """
    if timeout is None:
        timeout = _WAIT_TIMEOUT_SECONDS

    threshold = _get_threshold()
    first_pressure = True
    start = time.monotonic()

    while True:
        ok, status = check_vram_pressure(required_mb)
        if ok:
            if first_pressure is False:
                logger.info(
                    "VRAM pressure relieved: %.0f MB free (%.1f%%)",
                    status.free_mb,
                    status.percent_free * 100,
                )
            return status

        # First time under pressure — try to free memory
        if first_pressure:
            first_pressure = False
            logger.info(
                "VRAM under pressure (%.0f MB free, need ~%.0f MB). Attempting to free memory...",
                status.free_mb,
                required_mb,
            )
            await _try_free_vram()

            # Re-check after free attempt
            ok, status = check_vram_pressure(required_mb)
            if ok:
                return status

            # Invoke callback (e.g. notify frontend of queuing)
            if on_pressure_callback is not None:
                try:
                    await on_pressure_callback(status)
                except Exception:
                    logger.debug("Pressure callback failed", exc_info=True)

        elapsed = time.monotonic() - start
        if elapsed >= timeout:
            _, final_status = check_vram_pressure(required_mb)
            raise VRAMInsufficientError(
                required_mb=required_mb,
                free_mb=final_status.free_mb,
                total_mb=final_status.total_mb,
                threshold=threshold,
            )

        logger.debug(
            "Waiting for VRAM: %.0f MB free (need %.0f MB), elapsed %.0fs / %.0fs",
            status.free_mb,
            required_mb + status.total_mb * threshold,
            elapsed,
            timeout,
        )
        await asyncio.sleep(_WAIT_POLL_INTERVAL)


async def _try_free_vram() -> None:
    """Attempt to free VRAM by unloading idle models via the lifecycle manager.

    This is best-effort — if the lifecycle manager isn't running or no
    models are idle, it silently returns.
    """
    try:
        lm = _get_lifecycle_manager()
        # Trigger an immediate idle check (bypasses the 30s poll interval)
        await lm._unload_if_idle()
    except Exception as e:
        logger.debug("Failed to free VRAM via lifecycle manager: %s", e)

    # Also run GC + empty_cache as a safety net
    try:
        cleanup_fn = _get_cleanup_gpu_memory()
        cleanup_fn()
    except Exception:
        logger.debug("GPU memory cleanup failed", exc_info=True)
