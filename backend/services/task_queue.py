"""
Serial generation queue — ensures only one TTS inference runs at a time
to avoid GPU contention.
"""

import asyncio
import hashlib
import logging
from collections.abc import Coroutine
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)

# Hard cap on queued generations to prevent unbounded memory growth when
# the user fires off many requests while one is still processing.
_QUEUE_MAXSIZE = 20

# Keep references to fire-and-forget background tasks to prevent GC
_background_tasks: set = set()


class DuplicateGenerationError(Exception):
    """Raised when a generation with identical parameters is already in-flight."""

    def __init__(self, dedup_key: str):
        self.dedup_key = dedup_key
        super().__init__(f"Generation already in progress (key={dedup_key})")


@dataclass
class GenerationJob:
    """Queued generation work plus the generation ID it belongs to."""

    generation_id: str
    coro: Coroutine
    dedup_key: str | None = None


# Generation queue — serializes TTS inference to avoid GPU contention
# NOTE: These globals are safe in single-worker asyncio (single-threaded event
# loop). If deploying with multiple workers, replace with thread-safe structures
# or use a proper task queue (Redis, Celery).
_generation_queue: asyncio.Queue = None  # type: ignore  # initialized at startup
_generation_worker_task: asyncio.Task | None = None
_queued_generation_ids: set[str] = set()
_running_generation_tasks: dict[str, asyncio.Task] = {}
_cancelled_generation_ids: set[str] = set()
_inflight_dedup_keys: set[str] = set()


def create_background_task(coro) -> asyncio.Task:
    """Create a background task and prevent it from being garbage collected."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


async def _generation_worker():
    """Worker that processes generation tasks one at a time."""
    while True:
        job = await _generation_queue.get()
        try:
            if job.generation_id in _cancelled_generation_ids:
                _cancelled_generation_ids.discard(job.generation_id)
                job.coro.close()
                continue

            task = asyncio.create_task(job.coro)
            _running_generation_tasks[job.generation_id] = task
            _queued_generation_ids.discard(job.generation_id)
            try:
                await task
            except asyncio.CancelledError:
                if not task.cancelled():
                    raise
        except MemoryError:
            logger.exception("Out of memory during generation %s", job.generation_id)
            await _force_fail_if_active(
                job.generation_id,
                "Out of memory — try a shorter text or restart the app",
            )
        except Exception:
            logger.exception("Generation worker failed for job %s", job.generation_id)
            await _force_fail_if_active(
                job.generation_id,
                "Worker exited without writing terminal status",
            )
        finally:
            _running_generation_tasks.pop(job.generation_id, None)
            _queued_generation_ids.discard(job.generation_id)
            if job.dedup_key:
                _inflight_dedup_keys.discard(job.dedup_key)
            _generation_queue.task_done()


async def _force_fail_if_active(generation_id: str, error: str) -> None:
    """Best-effort recovery — flip an active row to failed if the worker
    bailed before writing a terminal status. Catches the case where the gen
    coroutine's own status-write raised (e.g. SQLite lock contention)."""
    try:
        from ..database import Generation as DBGeneration, get_db
        from . import history

        db = await asyncio.to_thread(lambda: next(get_db()))
        try:
            gen = db.query(DBGeneration).filter_by(id=generation_id).first()
            if gen is None:
                return
            if (gen.status or "completed") not in ("loading_model", "generating"):
                return
            await history.update_generation_status(
                generation_id=generation_id,
                status="failed",
                db=db,
                error=error,
            )
        finally:
            db.close()
    except Exception:
        logger.exception("_force_fail_if_active failed for %s", generation_id)


def enqueue_generation(generation_id: str, coro, *, dedup_key: str | None = None):
    """Add a generation coroutine to the serial queue.

    If *dedup_key* is provided and an identical in-flight generation exists,
    raises ``DuplicateGenerationError`` instead of enqueuing a duplicate.

    Raises ``RuntimeError`` if the queue is full (backpressure).
    """
    if _generation_queue is None:
        raise RuntimeError("Generation queue has not been initialized")

    if dedup_key and dedup_key in _inflight_dedup_keys:
        raise DuplicateGenerationError(dedup_key)
    if dedup_key:
        _inflight_dedup_keys.add(dedup_key)

    _queued_generation_ids.add(generation_id)
    try:
        _generation_queue.put_nowait(GenerationJob(generation_id=generation_id, coro=coro, dedup_key=dedup_key))
    except asyncio.QueueFull as err:
        _queued_generation_ids.discard(generation_id)
        if dedup_key:
            _inflight_dedup_keys.discard(dedup_key)
        raise RuntimeError(
            f"Generation queue is full ({_QUEUE_MAXSIZE} pending). "
            "Wait for the current generation to finish before starting another."
        ) from err


def cancel_generation(generation_id: str) -> Literal["queued", "running"] | None:
    """Cancel a queued or running generation if it is still active."""
    running_task = _running_generation_tasks.get(generation_id)
    if running_task is not None:
        running_task.cancel()
        return "running"

    if generation_id in _queued_generation_ids:
        _queued_generation_ids.discard(generation_id)
        _cancelled_generation_ids.add(generation_id)
        return "queued"

    return None


def init_queue(force: bool = False):
    """Initialize the generation queue and start the worker.

    Must be called once during application startup (inside a running event loop).
    """
    global _generation_queue, _generation_worker_task
    global _queued_generation_ids, _running_generation_tasks, _cancelled_generation_ids, _inflight_dedup_keys

    if _generation_worker_task is not None and not _generation_worker_task.done():
        if not force:
            return
        _generation_worker_task.cancel()
        for task in list(_running_generation_tasks.values()):
            task.cancel()

    _generation_queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _queued_generation_ids = set()
    _running_generation_tasks = {}
    _cancelled_generation_ids = set()
    _inflight_dedup_keys = set()
    _generation_worker_task = create_background_task(_generation_worker())


def compute_generation_dedup_key(
    text: str,
    profile_id: str,
    engine: str,
    model_size: str | None = None,
    seed: int | None = None,
    instruct: str | None = None,
) -> str:
    """Compute a content-hash dedup key for generation parameters.

    Identical inputs produce the same key, so duplicate sends within the same
    in-flight window are rejected instead of queued twice.
    """
    normalised = " ".join(text.split()).strip().lower()
    payload = (
        f"{normalised}|{profile_id}|{engine}|{model_size or ''}|{seed if seed is not None else ''}|{instruct or ''}"
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
