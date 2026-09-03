# 10 — Batch Processing Queue

## BatchQueueView at `/workspace/batch`
- **Component:** `BatchQueueView` in `app/src/components/Workspace/BatchQueueView.tsx`
- **What:** Job queue with status badges, progress bars, cancel action, and create job button. Polls server every 5 seconds.

## Job Table
- **What:** Table listing all batch jobs with columns: ID, Status, Progress, Created, Actions
- **Data source:** `GET /batch/jobs` returns `{ items: [{ id, status, progress, created_at }] }`
- **Loading state:** Skeleton rows while fetching

## Status Badges
- **pending:** `secondary` badge (gray)
- **running:** `default` badge (accent) with animated pulse
- **completed:** `outline` badge (subtle)
- **failed:** `destructive` badge (red)
- **cancelled:** `secondary` badge (gray strikethrough)

## Progress Bars
- **What:** Per-job progress indicator (0.0–1.0 range)
- **UI:** `Progress` component, shows percentage text
- **Visibility:** Hidden for non-running jobs

## Cancel Action
- **What:** XCircle icon button on pending/running jobs
- **API:** `POST /batch/jobs/{job_id}/cancel`
- **Behavior:** Mutates job list, auto-refreshes on success
- **Disabled for:** completed, failed, cancelled jobs

## Create Job Button
- **What:** "Create Job" button (Plus icon) at top of view
- **API:** `POST /batch/jobs` with `{ type: 'batch_generation' }`
- **Behavior:** Creates new pending job, auto-refreshes list

## Backend
- **Where:** `backend/services/batch.py` — global `BatchQueue` instance
- **Statuses:** pending, running, completed, failed, cancelled
- **Progress tracking:** `update_job_progress(job_id, progress, result_path)`

## Agent workflow (for the AI tool surface)
The queue is the right tool when an agent must produce many generations (e.g. a full audiobook,
episode batch, or per-chapter renders) without blocking on each one.

- **Create:** `POST /batch/jobs` with `{ type: "batch_generation" }` → returns a job id.
  (Assistant tool `batch_create_job`; MCP `21labs.batch_create`.)
- **Poll:** `GET /batch/jobs` lists all jobs `{ items: [{ id, status, progress, created_at }] }`.
  Poll until `status == "completed"` (frontend polls every 5s; agents should throttle similarly).
- **Inspect one:** `GET /batch/jobs/{job_id}`.
- **Cancel:** `POST /batch/jobs/{job_id}/cancel` (allowed while pending/running).

Decision rule: if the request is a single clip → call `generate_speech` directly. If it is N>1
clips or a long-form split → enqueue via the batch job and poll. Never spin N parallel blocking
tool calls when the queue exists.

See also `34-content-recipes.md` (recipes that fan out into batch work) and
`36-missing-features-inventory.md` (batch is currently invisible to both tool surfaces — wiring
target for Phases 2/3).

## Agent Callable
- **MCP Tools:** `21labs.list_batch_jobs`, `21labs.get_batch_job`, `21labs.create_batch_job`, `21labs.cancel_batch_job`
- **REST Endpoints:** `GET /batch/jobs`, `POST /batch/jobs`, `GET /batch/jobs/{id}`, `POST /batch/jobs/{id}/cancel`
- **Key Backend Files:** `backend/services/batch.py`, `backend/routes/batch.py`
- **Key Frontend Files:** `app/src/components/Workspace/BatchQueueView.tsx`
