"""
Rate limiting + retry utilities for backend task/model calls.

This is CALL PACING, not a user-usage quota. Its purpose is to avoid
hammering local models / external APIs with too many concurrent or
too-frequent calls — e.g. at most 1 generation every 8 seconds per domain.
It does NOT cap how much a user is allowed to do.

Two pieces:

- ``RateLimiter``: an async token-bucket / fixed-window limiter. ``acquire``
  blocks until a call is permitted, so callers naturally serialize. One
  instance per domain (tts, music, sfx, llm, ...).
- ``with_retry``: runs an async callable with bounded retries and exponential
  backoff when it raises. Used to make model calls resilient to transient
  failures (e.g. a cold model load, a flaky cloud endpoint).
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Default pace: at most 1 call per 8 seconds per domain.
DEFAULT_MIN_INTERVAL_SECONDS = 8.0
DEFAULT_MAX_BURST = 1


@dataclass
class RateLimitConfig:
    """Per-domain pacing config.

    ``min_interval`` is the minimum seconds between consecutive calls.
    ``max_burst`` lets a small number of calls through immediately after a
    quiet period (token-bucket style). Defaults to 1 (strict spacing).
    """

    min_interval: float = DEFAULT_MIN_INTERVAL_SECONDS
    max_burst: int = DEFAULT_MAX_BURST


class RateLimiter:
    """Async token-bucket rate limiter keyed by an arbitrary domain name.

    Thread-/coroutine-safe via an asyncio.Lock. ``acquire`` awaits until the
    next call is allowed, then returns. Callers should ``await acquire()``
    immediately before issuing the call they want to pace.
    """

    def __init__(self, config: RateLimitConfig | None = None):
        self._config = config or RateLimitConfig()
        self._lock = asyncio.Lock()
        # Timestamp (monotonic) when the next call is permitted.
        self._next_allowed = 0.0

    async def acquire(self) -> None:
        # NOTE: The lock is deliberately held across the sleep. Releasing it
        # before sleeping lets a second caller reserve an earlier slot and
        # return first, breaking strict FIFO pacing (observed as 0s gaps in
        # test_rate_limiter_paces_calls). Holding the lock serializes acquires
        # — which is exactly the contract of a pacing gate.
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                logger.debug("RateLimiter: pacing call, waiting %.2fs", wait)
                await asyncio.sleep(wait)
                now = time.monotonic()
            # Schedule the next permitted call ``min_interval`` after this one.
            # Using max() avoids drift / backlog if the caller was itself slow.
            self._next_allowed = max(now, self._next_allowed) + self._config.min_interval


# One limiter per domain, lazily created and shared process-wide.
_LIMITERS: dict[str, RateLimiter] = {}
_DEFAULT_CONFIG = RateLimitConfig()


def get_limiter(domain: str, config: RateLimitConfig | None = None) -> RateLimiter:
    """Return (creating if needed) the shared limiter for a domain."""
    limiter = _LIMITERS.get(domain)
    if limiter is None:
        limiter = RateLimiter(config or _DEFAULT_CONFIG)
        _LIMITERS[domain] = limiter
    return limiter


# Default non-retryable failure names (duck-typed by class name so this
# low-level module never imports HTTP or backend packages).
_NON_RETRYABLE_NAMES = frozenset(
    {
        "ModelNotCachedError",
        "ModelNotDownloadedError",
        "DownloadCancelledError",  # deliberate user cancel — never retry
        "ValueError",
        "LookupError",
        "KeyError",
        "FileNotFoundError",
    }
)
_NON_RETRYABLE_STATUS_CODES = frozenset({400, 401, 402, 403, 404, 409, 422})


def _default_retryable(exc: Exception) -> bool:
    """True unless the failure is clearly permanent (client error)."""
    status = getattr(exc, "status_code", None)
    if status in _NON_RETRYABLE_STATUS_CODES:
        return False
    return type(exc).__name__ not in _NON_RETRYABLE_NAMES


async def with_retry(
    func: Callable[[], Awaitable[Any]],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 10.0,
    backoff_factor: float = 2.0,
    label: str = "call",
    retryable: Callable[[Exception], bool] | None = None,
) -> Any:
    """Run ``func`` with bounded retries and exponential backoff.

    Args:
        func: Zero-arg async callable to invoke.
        attempts: Maximum tries (including the first).
        base_delay: Initial backoff seconds after the first failure.
        max_delay: Cap on a single backoff wait.
        backoff_factor: Multiplier applied to the delay each retry.
        label: Human-readable name for logs.
        retryable: Predicate deciding whether an exception deserves another
            attempt. Defaults to retrying everything except client errors
            (HTTP 4xx by status code, plus known permanent model errors),
            which fail fast instead of holding the queue through 3 attempts.

    Returns:
        The result of ``func`` on first success.

    Raises:
        The last exception if all attempts fail (or the first non-retryable one).
    """
    last_exc: Exception | None = None
    delay = base_delay
    for attempt in range(1, attempts + 1):
        try:
            return await func()
        except Exception as exc:  # retry is meant to be broad
            last_exc = exc
            should_retry = _default_retryable(exc) if retryable is None else retryable(exc)
            if not should_retry:
                raise
            if attempt >= attempts:
                break
            jitter = random.uniform(0, 0.3 * delay)
            wait = min(delay + jitter, max_delay)
            logger.warning(
                "%s failed (attempt %d/%d): %s — retrying in %.2fs",
                label,
                attempt,
                attempts,
                exc,
                wait,
            )
            await asyncio.sleep(wait)
            delay = min(delay * backoff_factor, max_delay)
    assert last_exc is not None
    raise last_exc
