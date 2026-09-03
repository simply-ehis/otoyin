# Batch Queue (mirror)

The queue for many generations. Full version: `docs/knowledge/10-batch-processing.md`.

## Endpoints
- `POST /batch/jobs` — create `{ type: "batch_generation" }` → job id.
- `GET /batch/jobs` — list `{ items: [{ id, status, progress, created_at }] }`.
- `GET /batch/jobs/{job_id}` — one job.
- `POST /batch/jobs/{job_id}/cancel` — while pending/running.

## Statuses
pending, running, completed, failed, cancelled.

## Agent rule
Single clip → `generate_speech` directly. N>1 clips or long-form split → enqueue and poll until
`completed` (throttle like the frontend's 5s poll; do not spin parallel blocking calls). Use for
full audiobooks, episode batches, per-chapter renders. See `34-content-recipes.md`.

## Retry policy
- Transient failure (network / executor hiccup): auto-retry up to 3× with exponential backoff
  (1s → 2s → 4s) BEFORE marking the item `failed`.
- Never retry a `cancelled` job. A `failed` item must be retried with a smaller chunk or different
  engine — never blindly re-enqueued with identical params.

## Chunk-size guidance
- Long-form (audiobook, multi-section YouTube): split into chapter/clip segments (≤ ~5 min each)
  and enqueue one item per chunk. This localizes any single failure and lets the queue resume.
- Kokoro long text needs chunk+timeout — split BEFORE enqueue.

## Failure recovery
On a `failed` item (`GET /batch/jobs/{job_id}`):
1. Inspect the item error.
2. Retry with a SMALLER chunk (split the segment) — usually fixes timeout / OOM.
3. Else retry with a DIFFERENT engine (e.g. orpheus → kokoro) if the engine is the cause.
4. Else SPLIT the job into smaller jobs and re-enqueue the remainder.
5. If the same item fails 3×, ALERT the user (stop silent retries) and report the last error.
Cancel a stuck job with `POST /batch/jobs/{job_id}/cancel` while pending/running.

## Cross-links
- [batch-queue skill](../batch-queue/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [34-content-recipes](../../docs/knowledge/34-content-recipes.md)
- [10-batch-processing](../../docs/knowledge/10-batch-processing.md)
