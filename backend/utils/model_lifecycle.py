"""
Model lifecycle manager: idle-unload scheduler + always-on lightweight runner.

Design
------
Heavy ML engines (TTS, Whisper, RVC, Seed-VC, music) are loaded on demand and
must be unloaded after a period of inactivity to keep the app's memory/RAM
footprint small. The planner LLM is pre-warmed at app entry but is NOT kept
always-resident — it idle-unloads after ``IDLE_TIMEOUT_SECONDS`` so it isn't
holding VRAM while the user isn't in the assistant.

The manager is intentionally engine-agnostic: backends register a small
``(is_loaded, unload)`` pair keyed by engine name. A background loop wakes every
``POLL_INTERVAL_SECONDS`` and unloads any engine idle for longer than
``IDLE_TIMEOUT_SECONDS`` (default 300s = 5 min), except engines listed in
``ALWAYS_ON_ENGINES`` (intentionally empty — every engine, including the planner,
is released when idle; DeepFilter unloads after cleanup use and never loads when
neural cleanup isn't requested).

Last-used time is stamped via :func:`mark_model_used`, which routes call at the
start of every inference/convert request. If an engine was never marked (e.g.
loaded out-of-band) it falls back to "loaded at manager start" so it is still
eligible for unload.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

from ..services.always_on import get_always_on_engines, is_engine_always_on  # noqa: E402

# Global idle timeout: 5 minutes (300s). All engines except explicitly
# always-on engines will unload after this period of inactivity.
IDLE_TIMEOUT_SECONDS = 300
POLL_INTERVAL_SECONDS = 30

# Engines that never idle-unload.
# Empty by default — even the planner LLM unloads after idle timeout.
# Can be overridden via DB settings (services/always_on.py).
ALWAYS_ON_ENGINES = frozenset()

# Circuit breaker defaults
_CIRCUIT_BREAKER_THRESHOLD = 3  # failures before opening
_CIRCUIT_BREAKER_COOLDOWN = 300  # seconds (5 min) before retry


@dataclass
class _EngineHandle:
    engine: str
    is_loaded: Callable[[], bool]
    unload: Callable[[], None]
    last_used: float = field(default_factory=time.monotonic)
    always_on: bool = False
    # Circuit breaker state
    consecutive_failures: int = 0
    circuit_open_until: float = 0.0  # monotonic timestamp when circuit closes


class ModelLifecycleManager:
    """Tracks engine activity and idle-unloads heavy models."""

    def __init__(self, idle_timeout: int = IDLE_TIMEOUT_SECONDS):
        self.idle_timeout = idle_timeout
        self._engines: dict[str, _EngineHandle] = {}
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._shutdown = False
        self._performance_mode = False
        self._per_engine_keepalive: dict[str, bool] = {}

    def register(
        self,
        engine: str,
        is_loaded: Callable[[], bool],
        unload: Callable[[], None],
    ) -> None:
        """Register an engine's loaded-check and unload callbacks."""
        self._engines[engine] = _EngineHandle(
            engine=engine,
            is_loaded=is_loaded,
            unload=unload,
            always_on=is_engine_always_on(engine),
        )

    def mark_model_used(self, engine: str) -> None:
        """Stamp ``engine`` as just-used so the idle timer resets."""
        handle = self._engines.get(engine)
        if handle is not None:
            handle.last_used = time.monotonic()

    def record_load_success(self, engine: str) -> None:
        """Record a successful model load — resets the circuit breaker."""
        handle = self._engines.get(engine)
        if handle is not None:
            handle.consecutive_failures = 0
            handle.circuit_open_until = 0.0

    def record_load_failure(self, engine: str) -> None:
        """Record a failed model load — increments failure count, opens circuit if threshold reached."""
        handle = self._engines.get(engine)
        if handle is None:
            return
        handle.consecutive_failures += 1
        if handle.consecutive_failures >= _CIRCUIT_BREAKER_THRESHOLD:
            handle.circuit_open_until = time.monotonic() + _CIRCUIT_BREAKER_COOLDOWN
            logger.warning(
                "Circuit breaker OPEN for '%s' after %d consecutive failures — retry blocked for %ds",
                engine,
                handle.consecutive_failures,
                _CIRCUIT_BREAKER_COOLDOWN,
            )

    def is_circuit_open(self, engine: str) -> bool:
        """True if the circuit breaker is blocking retries for this engine."""
        handle = self._engines.get(engine)
        if handle is None:
            return False
        if handle.circuit_open_until <= 0.0:
            return False
        if time.monotonic() >= handle.circuit_open_until:
            # Cooldown expired — allow one retry
            handle.circuit_open_until = 0.0
            return False
        return True

    def circuit_retry_after_seconds(self, engine: str) -> float:
        """Seconds until a breaker-blocked engine may be retried (0 if not blocked)."""
        handle = self._engines.get(engine)
        if handle is None or handle.circuit_open_until <= 0.0:
            return 0.0
        return max(0.0, handle.circuit_open_until - time.monotonic())

    def refresh_always_on(self) -> None:
        """Re-read always-on flags from DB and update registered handles.

        Called after a user toggles an engine's always-on flag so the idle
        loop picks the change up without a restart.
        """
        for handle in self._engines.values():
            handle.always_on = is_engine_always_on(handle.engine)

    def set_performance_mode(self, enabled: bool) -> None:
        """Toggle speed-over-RAM mode.

        When enabled, idle-unload is suspended so models stay resident — faster
        subsequent generations at the cost of more RAM/VRAM.
        """
        self._performance_mode = bool(enabled)
        logger.info("Lifecycle: performance mode %s", "ON" if enabled else "off")

    def refresh_performance_mode(self) -> None:
        """Re-read the persisted performance-mode flag from settings.

        Called each poll loop so a toggle in the UI takes effect without a
        restart. Failures are swallowed — the last known value stays in force.
        """
        try:
            from ..services.settings import get_per_engine_keepalive, get_performance_mode

            self._performance_mode = get_performance_mode()
            try:
                self._per_engine_keepalive = get_per_engine_keepalive() or {}
            except Exception:
                logger.debug("Lifecycle: could not read per-engine keepalive", exc_info=True)
        except Exception:
            logger.debug("Lifecycle: could not read performance mode", exc_info=True)

    async def _unload_if_idle(self) -> None:
        now = time.monotonic()
        for engine, handle in list(self._engines.items()):
            try:
                # Per-engine override wins over global performance_mode
                effective_keepalive = self._per_engine_keepalive.get(engine, self._performance_mode)
                if effective_keepalive:
                    continue
                if handle.always_on:
                    continue
                if not handle.is_loaded():
                    continue
            except Exception:
                # One broken backend probe must not skip the whole sweep.
                logger.debug("Lifecycle: load check failed for '%s'", engine, exc_info=True)
                continue
            idle_for = now - handle.last_used
            if idle_for >= self.idle_timeout:
                try:
                    logger.info(
                        "Lifecycle: unloading idle engine '%s' (idle %.0fs >= %ds)",
                        engine,
                        idle_for,
                        self.idle_timeout,
                    )
                    await asyncio.to_thread(handle.unload)
                except Exception:
                    logger.exception("Lifecycle: failed to unload '%s'", engine)

    async def _loop(self) -> None:
        try:
            while not self._shutdown:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                if self._shutdown:
                    break
                self.refresh_performance_mode()
                await self._unload_if_idle()
        except asyncio.CancelledError:
            pass

    def start(self) -> None:
        """Start the background idle-unload loop (idempotent)."""
        if self._task is not None and not self._task.done():
            return
        self._shutdown = False
        # Pre-read persisted flag so the 0-30s window after restart isn't stale.
        with contextlib.suppress(Exception):
            self.refresh_performance_mode()
        self._task = asyncio.ensure_future(self._loop())
        logger.info(
            "Lifecycle: scheduler started (idle_timeout=%ds, always_on=%s)",
            self.idle_timeout,
            sorted(get_always_on_engines()),
        )

    async def stop(self) -> None:
        """Cancel the background loop and unload all non-always-on engines."""
        self._shutdown = True
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None
        # Best-effort unload of everything except always-on engines.
        for engine, handle in list(self._engines.items()):
            if handle.always_on:
                continue
            if handle.is_loaded():
                try:
                    await asyncio.to_thread(handle.unload)
                except Exception:
                    logger.exception("Lifecycle: failed to unload '%s' on stop", engine)


# Module-level singleton used across the app.
lifecycle_manager = ModelLifecycleManager()
