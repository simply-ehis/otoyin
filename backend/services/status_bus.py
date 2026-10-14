"""Generation status event bus (SSE fan-out).

Owns the per-generation subscriber queues shared by the status producers
(generation service, task queue) and the ``GET /generate/{id}/status``
consumer in routes/generations.py. Lives in services (not routes) so the
generation service can publish without importing the route layer — the old
services→routes import was a layer inversion that also made the service
unimportable without FastAPI router setup.

routes/generations.py re-exports :func:`notify_generation_status` for
backward compatibility (tests and external callers patch that name).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

logger = logging.getLogger(__name__)

_status_subscribers: dict[str, list[asyncio.Queue]] = {}
_status_lock = asyncio.Lock()
_status_creation_time: dict[str, float] = {}
_SSE_TTL_SECONDS = 600  # Evict stale subscriber entries after 10 minutes


async def notify_generation_status(generation_id: str, status: str, payload: dict) -> None:
    """Push status update to all SSE subscribers for this generation."""
    async with _status_lock:
        # Lazy cleanup: evict stale entries
        now = time.monotonic()
        stale_ids = [
            gid
            for gid, t in _status_creation_time.items()
            if now - t > _SSE_TTL_SECONDS and gid not in _status_subscribers
        ]
        for gid in stale_ids:
            _status_creation_time.pop(gid, None)

        # Snapshot the subscriber list under the lock to avoid iteration race
        queues = list(_status_subscribers.get(generation_id, []))
    # The `status` parameter is authoritative — payloads don't always
    # carry a "status" key.
    terminal = status in ("completed", "failed")
    for q in queues:
        if terminal:
            # Never drop a terminal event: the SSE consumer only exits on
            # completed/failed, so a dropped one strands the stream open
            # forever. Make room by expiring the oldest queued event (an
            # intermediate progress update) instead of blocking the producer.
            if q.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    q.get_nowait()
            q.put_nowait(payload)
            continue
        with contextlib.suppress(asyncio.QueueFull):
            q.put_nowait(payload)
