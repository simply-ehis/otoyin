---
name: batch-queue
description: How otoyin's batch queue works for many generations — POST /batch/jobs (name/func_name/func_args), statuses pending/running/completed/failed/cancelled, polling (~5s), cancel, and the retry/failure-recovery policy. Load when producing N>1 clips (audiobook, episode batch, per-chapter renders).
---
# Batch Queue

## Purpose
The batch queue lets an agent produce many generations (audiobook chapters, episode batches,
per-clip renders) without blocking on each one. It is the correct tool when N>1; single clips use
`generate_speech` directly.

## When to use
- Full audiobook / long-form split into chapters.
- Episode batch or per-chapter renders.
- Any N>1 clip job that would otherwise be parallel blocking calls.

## Prerequisites
- Backend: `backend/services/batch.py` (`BatchQueue`, `max_concurrent=1` — serial worker).
- Tool surface: `21labs.create_batch_job` / `get_batch_job` / `list_batch_jobs` /
  `cancel_batch_job` (MCP) or `POST/GET /batch/jobs*` (REST). See
  [mcp-tool-reference](./mcp-tool-reference/SKILL.md).
- See [agent-operating-guide](./agent-operating-guide/SKILL.md) and [troubleshooting](./troubleshooting/SKILL.md).

## Create
```
POST /batch/jobs   (MCP: 21labs.create_batch_job)
body: { "name": str, "func_name": str, "func_args": dict }
→ { "id": str, "name": str, "status": "pending", "func_name": str, "created_at": str }
```
`func_name` references a scripting function (`21labs.list_scripting_functions`). The job is
enqueued and run by the serial background worker.

## Statuses
`pending → running → completed | failed | cancelled` (`BatchJobStatus` enum).
- `cancel_job` succeeds only while `pending`/`running`; otherwise 404 "not found or already completed".

## Poll (throttle ~5s)
```
GET /batch/jobs            → { "jobs": [ {id, name, status, progress, result, result_path, error, ...} ] }
GET /batch/jobs/{job_id}   → one job (404 if id unknown)
```
Frontend polls every 5s; agents should throttle similarly. Do NOT spin N parallel blocking calls.
`progress` is 0.0–1.0.

## Cancel
```
POST /batch/jobs/{job_id}/cancel   (MCP: 21labs.cancel_batch_job)
→ { "message": "Job cancelled", "id": job_id }   | 404 if not cancellable
```

## RETRY POLICY + FAILURE RECOVERY
On a `failed` item (`get_batch_job` shows `status="failed"`, `error=...`):
1. **Retry with a smaller chunk** — split long text at clause/paragraph boundaries (Kokoro chunks at
   250 chars; whisper caps 200 MB). Re-enqueue via `create_batch_job`.
2. **Different engine** — if the target engine is missing/throwing, apply the
   [engine-atlas](./engine-atlas/SKILL.md) fallback (heavy→fish_speech; clone→pocket_tts/fish_speech).
3. **Split long-form** into chapter/clip segments rather than one huge job.
4. **Alert** the user if the same item fails repeatedly after retries — do not loop silently.
5. **Cancel** a stuck job before re-enqueueing to avoid a zombie pending entry.

## Chunk-size guidance
- Long-form narration → split into chapter/clip segments (each a job or a segment).
- Keep each segment within the engine's comfortable limits (Kokoro ≤250 chars/chunk, 120s/chunk
  timeout; single short sentence 300s timeout).

## Worked example
```
21labs.create_batch_job(name="Audiobook ch1", func_name="generate_speech", func_args={...})
→ { "id": "<job_id>", "status": "pending", ... }
# poll
21labs.get_batch_job(job_id="<job_id>")   # until status=="completed"
# on failure
21labs.cancel_batch_job(job_id="<job_id>")
21labs.create_batch_job(name="Audiobook ch1 retry", func_name="generate_speech", func_args={ smaller text })
```

## Pitfalls / Gotchas
- `max_concurrent=1` — jobs run **serially**, not in parallel. Expect throughput = one at a time.
- `get_batch_job` returns 404 for unknown ids (not "pending") — don't treat 404 as "still running".
- `func_name` must be a real scripting function; unknown name → job fails at runtime.
- Cancel only works on pending/running; completed/failed jobs are terminal.

## Cross-links
- [engine-atlas](./engine-atlas/SKILL.md)
- [agent-operating-guide](./agent-operating-guide/SKILL.md)
- [mcp-tool-reference](./mcp-tool-reference/SKILL.md)
- [troubleshooting](./troubleshooting/SKILL.md)

## Validation
- Job reaches `status="completed"` with a non-empty `result_path` before declaring done.
