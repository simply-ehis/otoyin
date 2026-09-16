"""Simple in-memory sliding-window rate limiter.

No external dependencies. Good enough for a single-process server.
"""

from __future__ import annotations

import time
from collections import defaultdict


class RateLimiter:
    """Sliding-window counter per key. Returns True when the request is allowed."""

    def __init__(self, max_requests: int, window_seconds: int, max_keys: int = 10000):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._hits: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        hits = self._hits[key]
        # Prune old entries
        self._hits[key] = hits = [t for t in hits if t > cutoff]
        if len(hits) >= self.max_requests:
            return False
        hits.append(now)
        # Bound memory: evict oldest keys when over capacity
        if len(self._hits) > self.max_keys:
            oldest = next(iter(self._hits))
            del self._hits[oldest]
        return True

    def prune(self) -> None:
        """Remove expired entries for all keys. Call periodically to bound memory."""
        now = time.time()
        cutoff = now - self.window_seconds
        empty = [k for k, v in self._hits.items() if not [t for t in v if t > cutoff]]
        for k in empty:
            del self._hits[k]


# Checkout: 10 requests per minute per IP
checkout_limiter = RateLimiter(max_requests=10, window_seconds=60)

# License fetch: 20 requests per minute per IP
license_limiter = RateLimiter(max_requests=20, window_seconds=60)
