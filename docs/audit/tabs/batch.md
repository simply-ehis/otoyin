# Batch Queue

Route: `/batch` → `app/src/features/workspace/BatchQueueView.tsx`. In nav: yes (top-level promoted; TAB_AUDIT lists as Export group).

## Job
A user comes here to process multiple files (batch jobs) with status tracking.

## Complete-flow checklist
1. Input: multiple files. PARTIAL.
2. Configure: job func/args. PARTIAL.
3. Model readiness: per job. PARTIAL.
4. Run: queue with statuses pending/running/completed/failed/cancelled, polling ~5s, cancel. PRESENT (per batch-queue skill).
5. Preview: n/a.
6. Outputs: results. PARTIAL.
7. Save/history: jobs persisted. PARTIAL.
8. Link out: to Library. GUESS.
9. Errors/recovery: retry/failure recovery per skill. PARTIAL.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Batch jobs | yes (`services/batch.py`, `routes/batch.py`, `task_queue.py`) | yes |

## Bugs/risks
- MINOR: cancel actually stops work? verify (skill says cancel). GUESS.

## Gaps & right UX
- Add retry UI + progress detail. PROPOSAL.
Confidence: TRACED (skill).