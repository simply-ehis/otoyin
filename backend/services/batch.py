"""Batch processing queue for otoyin — async worker processes jobs in background."""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

logger = logging.getLogger(__name__)


class BatchJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class BatchJob:
    id: str
    name: str
    status: BatchJobStatus = BatchJobStatus.PENDING
    progress: float = 0.0
    result: dict | None = None
    result_path: str | None = None
    error: str | None = None
    created_at: str = ""
    completed_at: str | None = None
    func_name: str = ""
    func_args: dict = field(default_factory=dict)
    group_id: str | None = None


def _group_jobs(group_id: str) -> list[BatchJob]:
    return [j for j in _queue.jobs if j.group_id == group_id]


@dataclass
class BatchQueue:
    jobs: list[BatchJob] = field(default_factory=list)
    running: bool = False
    max_concurrent: int = 1


_queue = BatchQueue()
_worker_task: asyncio.Task | None = None
_background_tasks: set[asyncio.Task] = set()


def _now() -> str:
    return datetime.now(UTC).isoformat()


def add_job(
    name: str,
    func_name: str = "",
    func_args: dict | None = None,
    group_id: str | None = None,
) -> BatchJob:
    job = BatchJob(
        id=str(uuid.uuid4()),
        name=name,
        created_at=_now(),
        func_name=func_name,
        func_args=func_args or {},
        group_id=group_id,
    )
    _queue.jobs.append(job)
    return job


def get_job(job_id: str) -> BatchJob | None:
    for job in _queue.jobs:
        if job.id == job_id:
            return job
    return None


def list_jobs() -> list[BatchJob]:
    return _queue.jobs


def cancel_job(job_id: str) -> bool:
    job = get_job(job_id)
    if job and job.status in (BatchJobStatus.PENDING, BatchJobStatus.RUNNING):
        job.status = BatchJobStatus.CANCELLED
        return True
    return False


# NOTE: kept for potential public API surface
def update_job_progress(job_id: str, progress: float, result_path: str | None = None):
    job = get_job(job_id)
    if job:
        job.progress = min(1.0, progress)
        if result_path:
            job.result_path = result_path


def complete_job(job_id: str, result: dict | None = None):
    job = get_job(job_id)
    if job:
        # Don't overwrite a user cancellation that raced with completion.
        if job.status == BatchJobStatus.CANCELLED:
            return
        job.status = BatchJobStatus.COMPLETED
        job.progress = 1.0
        job.result = result
        job.completed_at = _now()


def fail_job(job_id: str, error: str):
    job = get_job(job_id)
    if job:
        job.status = BatchJobStatus.FAILED
        job.error = error
        job.completed_at = _now()


def add_job_from_scripting(name: str, func_name: str, func_args: dict) -> BatchJob:
    """Add a job that will be executed via the scripting API."""
    job = add_job(name=name, func_name=func_name, func_args=func_args)
    return job


async def _process_job(job: BatchJob):
    """Process a single batch job using the scripting API."""
    from .scripting_api import execute_api

    job.status = BatchJobStatus.RUNNING
    job.progress = 0.0

    try:
        if job.status == BatchJobStatus.CANCELLED:
            return

        job.progress = 0.5
        result = execute_api(job.func_name, job.func_args)
        job.progress = 1.0

        # Re-check after the (potentially long) run: a cancel during execution
        # must win over completion.
        if job.status == BatchJobStatus.CANCELLED:
            return

        if "error" in result:
            fail_job(job.id, result["error"])
            return

        complete_job(job.id, result)
    except asyncio.CancelledError:
        job.status = BatchJobStatus.CANCELLED
    except Exception as e:
        fail_job(job.id, f"{type(e).__name__}: {e}")
        logger.exception("Batch job %s failed", job.id)


async def _batch_worker():
    """Background worker that processes pending batch jobs one at a time."""
    while True:
        pending = [j for j in _queue.jobs if j.status == BatchJobStatus.PENDING]
        for job in pending:
            if not _queue.running:
                return
            await _process_job(job)
        await asyncio.sleep(0.5)


def start_worker():
    """Start the background batch worker."""
    global _worker_task, _queue
    _queue.running = True
    _worker_task = asyncio.create_task(_batch_worker())
    _background_tasks.add(_worker_task)
    _worker_task.add_done_callback(_background_tasks.discard)
