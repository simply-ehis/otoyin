"""REST API routes for the batch processing queue."""

import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..errors import (
    ERR_EMPTY_JOB_LIST,
    ERR_FUNC_NOT_IN_CATALOG,
    ERR_FUNCS_NOT_IN_CATALOG,
    ERR_JOB_NOT_FOUND,
)

router = APIRouter(tags=["batch"])


class BatchCreateRequest(BaseModel):
    name: str
    func_name: str
    func_args: dict = {}


class BulkCreateRequest(BaseModel):
    jobs: list[BatchCreateRequest]
    group_id: str | None = None


def _resolve_job_or_group(job_or_group_id: str) -> list:
    """Resolve an id to its job list: a single job or all members of a group."""
    from ..services.batch import _group_jobs, get_job

    job = get_job(job_or_group_id)
    if job is not None:
        if job.group_id:
            members = _group_jobs(job.group_id)
            return members or [job]
        return [job]
    members = _group_jobs(job_or_group_id)
    if members:
        return members
    return []


def _require_localhost(request: Request) -> None:
    """Job submission executes arbitrary scripting-API functions — loopback only."""
    client = request.client
    if client is None:
        return  # internal/test calls
    if client.host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Batch endpoints are localhost-only")


@router.get("/batch/jobs")
async def list_jobs():
    from ..services.batch import list_jobs

    jobs = [
        {
            "id": j.id,
            "name": j.name,
            "status": j.status.value,
            "progress": j.progress,
            "result": j.result,
            "result_path": j.result_path,
            "error": j.error,
            "created_at": j.created_at,
            "completed_at": j.completed_at,
            "func_name": j.func_name,
        }
        for j in list_jobs()
    ]
    return {"jobs": jobs}


@router.post("/batch/jobs")
async def create_job(data: BatchCreateRequest, request: Request):
    _require_localhost(request)

    from ..services.batch import add_job_from_scripting
    from ..services.scripting_api import list_api_functions

    # Allowlist: only registered scripting-API functions may run.
    allowed = {entry["name"] for entry in list_api_functions()}
    if data.func_name not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{ERR_FUNC_NOT_IN_CATALOG}: {data.func_name}. Available: {sorted(allowed)}",
        )

    job = add_job_from_scripting(
        name=data.name,
        func_name=data.func_name,
        func_args=data.func_args,
    )
    return {
        "id": job.id,
        "name": job.name,
        "status": job.status.value,
        "func_name": job.func_name,
        "created_at": job.created_at,
    }


@router.get("/batch/jobs/{job_id}")
async def get_job(job_id: str):
    from ..services.batch import get_job

    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)
    return {
        "id": job.id,
        "name": job.name,
        "status": job.status.value,
        "progress": job.progress,
        "result": job.result,
        "result_path": job.result_path,
        "error": job.error,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
        "func_name": job.func_name,
    }


@router.post("/batch/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    from ..services.batch import cancel_job

    if cancel_job(job_id):
        return {"message": "Job cancelled", "id": job_id}
    raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)


@router.post("/batch/jobs/bulk")
async def create_jobs_bulk(data: BulkCreateRequest, request: Request):
    """Queue multiple jobs at once, grouped under one group_id for polling."""
    _require_localhost(request)
    if not data.jobs:
        raise HTTPException(status_code=400, detail=ERR_EMPTY_JOB_LIST)

    from ..services.batch import add_job
    from ..services.scripting_api import list_api_functions

    allowed = {entry["name"] for entry in list_api_functions()}
    unknown = sorted({j.func_name for j in data.jobs} - allowed)
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"{ERR_FUNCS_NOT_IN_CATALOG}: {unknown}. Available: {sorted(allowed)}",
        )

    group_id = data.group_id or str(uuid.uuid4())
    created = [
        {
            "id": job.id,
            "name": job.name,
            "status": job.status.value,
            "func_name": job.func_name,
            "group_id": group_id,
            "created_at": job.created_at,
        }
        for j in data.jobs
        for job in [add_job(name=j.name, func_name=j.func_name, func_args=j.func_args, group_id=group_id)]
    ]
    return {"group_id": group_id, "jobs": created}


@router.get("/batch/jobs/{job_id}/items")
async def get_job_items(job_id: str):
    """List the jobs belonging to this id — a single job or its whole group."""
    members = _resolve_job_or_group(job_id)
    if not members:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)
    return {
        "items": [
            {
                "id": j.id,
                "name": j.name,
                "group_id": j.group_id,
                "status": j.status.value,
                "progress": j.progress,
                "result": j.result,
                "result_path": j.result_path,
                "error": j.error,
                "created_at": j.created_at,
                "completed_at": j.completed_at,
                "func_name": j.func_name,
            }
            for j in members
        ]
    }


@router.get("/batch/jobs/{job_id}/progress")
async def get_job_progress(job_id: str):
    """Aggregated progress across a job (or every member of its group)."""
    from ..services.batch import BatchJobStatus, get_job

    members = _resolve_job_or_group(job_id)
    if not members and (job := get_job(job_id)) is not None:
        members = [job]
    if not members:
        raise HTTPException(status_code=404, detail=ERR_JOB_NOT_FOUND)

    counts: dict[str, int] = {s.value: 0 for s in BatchJobStatus}
    for j in members:
        counts[j.status.value] += 1
    return {
        "total": len(members),
        "progress": sum(j.progress for j in members) / len(members),
        "status_counts": counts,
        "done": all(j.status in (BatchJobStatus.COMPLETED, BatchJobStatus.CANCELLED) for j in members),
    }


@router.post("/batch/jobs/{job_id}/retry")
async def retry_job(job_id: str, request: Request):
    """Requeue failed/cancelled jobs — a single job or every failure in its group."""
    _require_localhost(request)

    from ..services.batch import add_job, get_job
    from ..services.scripting_api import list_api_functions

    members = _resolve_job_or_group(job_id)
    single = get_job(job_id)
    if single is not None and single.group_id is None:
        members = [single]
    retryable = [j for j in members if j.status.value in ("failed", "cancelled")]
    if not retryable:
        raise HTTPException(
            status_code=400,
            detail="No failed/cancelled jobs to retry for this id",
        )

    allowed = {entry["name"] for entry in list_api_functions()}
    retried = []
    for j in retryable:
        if j.func_name not in allowed:
            continue
        new_job = add_job(
            name=f"{j.name} (retry)", func_name=j.func_name, func_args=dict(j.func_args), group_id=j.group_id
        )
        retried.append({"id": new_job.id, "name": new_job.name, "status": new_job.status.value})
    return {"retried": retried, "count": len(retried)}
