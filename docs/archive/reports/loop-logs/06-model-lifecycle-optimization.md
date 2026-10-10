# Loop log — 06-model-lifecycle-optimization

## 2026-09-05 — PLAN
Re-read "read before starting": most is built (lazy factories, 5-min idle-unload, circuit breaker,
minimal bundle set). Audit-only posture confirmed.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| mark_model_used audit | Callers in assistant_stream:98, diarization:122/149, generate:49/104, generations:367/406/441/593, llm:46, streaming_stt:122, transcription:95/148/194, transcript_edit:46. Full route-vs-registry cross-check (EVERY inference route) still open — shared with 01 unit 6 item 5 | IN PROGRESS (no missing call found yet; exhaustive proof pending) |
| cached/local_status field | `docs/marketplace/catalog-schema-v1.json`: zero hits for cached/local_status/downloaded/installed. `marketplace_catalog.py` PRODUCTS entries: no local-status field (only comment "Pre-installed" on free extras). Model-selection UI gating on cache state: not present | FAIL → REAL GAP. Next: add `local_status` enum to catalog entry + gate selection UI (cached=one-step activate, else marketplace flow). Do NOT retry blindly — needs a small spec first |
| Startup profiling | `otoyin_lifespan` in app.py confirmed; planner pre-warm cost NOT measured in this pass | NOT STARTED (needs a profiling run) |
| UI lifecycle signal | Circuit-open signal EXISTS (clientCore engine_circuit_open + errors.ts retry text — see 01 log). loading/ready/idle-unloaded states: not verified visible | IN PROGRESS (1/4 states proven) |

## AUDIT checkpoint
Route-vs-lifecycle cross-check re-run: no unit changed lifecycle calls (verify-only pass). PASS.

## Exit checklist
- [ ] Zero inference routes missing mark (pending exhaustive check)
- [ ] Catalog + UI agree on cached gating (GAP — field missing)
- [ ] Every lifecycle state has UI signal (1/4)
→ FILE IN PROGRESS. Hardest open item: unit 2 needs implementation, not just verification.
