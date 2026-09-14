"""
Serial generation queue — ensures only one TTS inference runs at a time
to avoid GPU contention.
"""

import asyncio
import contextlib
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
    # Scheduling lane: "default" for generations, "preview" for short
    # audition snippets. Preview jobs jump ahead of waiting default jobs
    # (bounded — see _PREVIEW_MAX_JUMPS) so a tap-to-hear never waits
    # behind a 10-minute audiobook, but never preempts a running job and
    # never runs concurrently with one (single-inference invariant holds).
    lane: str = "default"


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

# Cap on consecutive preview-lane jumps before a waiting default job is
# served — the anti-starvation bound for lane priority.
_PREVIEW_MAX_JUMPS = 3
_preview_jumps = 0


def create_background_task(coro) -> asyncio.Task:
    """Create a background task and prevent it from being garbage collected.

    Production-grade: logs unretrieved exceptions ( CancelledError is normal
    shutdown noise and stays quiet). Without this, a failed download/generation
    worker surfaces as "Task exception was never retrieved" and the frontend
    just sees the backend go silent mid-download.
    """

    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            logger.error("Background task failed: %s", exc, exc_info=exc)

    task.add_done_callback(_done)
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
            if job.lane == "default":
                # A default job got the worker: the preview-jump budget resets.
                global _preview_jumps
                _preview_jumps = 0
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
            # The SSE client only leaves on a terminal payload — without
            # this notify it hangs until the keepalive timeout.
            from .status_bus import notify_generation_status

            await notify_generation_status(
                generation_id,
                "failed",
                {"id": generation_id, "status": "failed", "error": error},
            )
        finally:
            db.close()
    except Exception:
        logger.exception("_force_fail_if_active failed for %s", generation_id)


def enqueue_generation(generation_id: str, coro, *, dedup_key: str | None = None, lane: str = "default"):
    """Add a generation coroutine to the serial queue.

    If *dedup_key* is provided and an identical in-flight generation exists,
    raises ``DuplicateGenerationError`` instead of enqueuing a duplicate.

    ``lane="preview"`` jobs jump ahead of *waiting* default jobs (bounded by
    ``_PREVIEW_MAX_JUMPS`` consecutive jumps) so short auditions stay snappy
    behind long renders. They never preempt or run alongside the active job.

    Raises ``RuntimeError`` if the queue is full (backpressure).
    """
    if _generation_queue is None:
        raise RuntimeError("Generation queue has not been initialized")

    if dedup_key and dedup_key in _inflight_dedup_keys:
        raise DuplicateGenerationError(dedup_key)
    if dedup_key:
        _inflight_dedup_keys.add(dedup_key)

    _queued_generation_ids.add(generation_id)
    job = GenerationJob(generation_id=generation_id, coro=coro, dedup_key=dedup_key, lane=lane)
    try:
        if lane == "preview" and _try_preview_jump(job):
            return
        _generation_queue.put_nowait(job)
    except asyncio.QueueFull as err:
        _queued_generation_ids.discard(generation_id)
        if dedup_key:
            _inflight_dedup_keys.discard(dedup_key)
        try:
            coro.close()
        except Exception:
            logger.debug("Failed to close dropped generation coroutine", exc_info=True)
        raise RuntimeError(
            f"Generation queue is full ({_QUEUE_MAXSIZE} pending). "
            "Wait for the current generation to finish before starting another."
        ) from err


def _try_preview_jump(job: GenerationJob) -> bool:
    """Insert a preview job ahead of waiting default jobs. True if jumped.

    Synchronous (put_nowait/get_nowait only) so it is unit-testable without
    a running loop. Gives up (returns False) when the jump budget is spent
    or the queue is full — the caller then enqueues normally (or 429s).
    """
    global _preview_jumps
    if _preview_jumps >= _PREVIEW_MAX_JUMPS:
        return False
    if _generation_queue is None or _generation_queue.qsize() >= _QUEUE_MAXSIZE:
        return False
    waiting: list[GenerationJob] = []
    try:
        while True:
            waiting.append(_generation_queue.get_nowait())
    except asyncio.QueueEmpty:
        pass
    if not waiting:
        return False
    _preview_jumps += 1
    # Keep preview jobs FIFO among themselves: the newcomer goes after
    # already-waiting previews but ahead of waiting default jobs.
    queued_previews = [j for j in waiting if j.lane == "preview"]
    queued_defaults = [j for j in waiting if j.lane != "preview"]
    try:
        for pending in (*queued_previews, job, *queued_defaults):
            _generation_queue.put_nowait(pending)
    except asyncio.QueueFull:
        # Lost the race with another producer: restore order best-effort,
        # then let the caller take the normal path.
        for pending in waiting:
            with contextlib.suppress(asyncio.QueueFull):
                _generation_queue.put_nowait(pending)
        _preview_jumps -= 1
        return False
    # NOTE: no task_done() here — drained items are re-queued unfinished and
    # the worker still owes exactly one task_done() per item it processes.
    return True


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
    global _preview_jumps

    if _generation_worker_task is not None and not _generation_worker_task.done():
        if not force:
            return
        _generation_worker_task.cancel()
        for task in list(_running_generation_tasks.values()):
            task.cancel()

    # Drain queued (never-started) coroutines so they neither warn as
    # un-awaited nor leave rows stuck: stale 'generating' rows are healed
    # to failed by startup_cleanup on boot.
    if _generation_queue is not None:
        while not _generation_queue.empty():
            try:
                stale = _generation_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            try:
                stale.coro.close()
            except Exception:
                logger.debug("Failed to close dropped generation coroutine", exc_info=True)
            finally:
                _generation_queue.task_done()

    _generation_queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _queued_generation_ids = set()
    _running_generation_tasks = {}
    _cancelled_generation_ids = set()
    _inflight_dedup_keys = set()
    _preview_jumps = 0
    _generation_worker_task = create_background_task(_generation_worker())


def compute_generation_dedup_key(
    text: str,
    profile_id: str,
    engine: str,
    model_size: str | None = None,
    seed: int | None = None,
    instruct: str | None = None,
    temperature: float | None = None,
    normalize: bool | None = None,
    voice_clean: bool | None = None,
    emotion: str | None = None,
    personality: bool | None = None,
    use_cloud: bool | None = None,
) -> str:
    """Compute a content-hash dedup key for generation parameters.

    Identical inputs produce the same key, so duplicate sends within the same
    in-flight window are rejected instead of queued twice. Every parameter
    that changes the output audio is part of the key — otherwise the same
    text with different effects/temperature wrongly 409s as a duplicate.
    """
    normalised = " ".join(text.split()).strip().lower()
    payload = (
        f"{normalised}|{profile_id}|{engine}|{model_size or ''}|{seed if seed is not None else ''}|{instruct or ''}"
        f"|{temperature if temperature is not None else ''}|{normalize}|{voice_clean}|{emotion or ''}"
        f"|{personality}|{use_cloud}"
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
