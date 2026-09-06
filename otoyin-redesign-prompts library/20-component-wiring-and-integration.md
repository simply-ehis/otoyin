# Prompt: Component Wiring — No Orphaned Components, No Stranded Endpoints

## Context

Two-directional problem: (a) a component gets built during the rebuild
(03) but never actually gets mounted into a real route/screen — it exists,
compiles, maybe even has a test, but a user can never reach it; (b) a
backend endpoint exists with no frontend caller at all — a capability with
literally no way to trigger it from the app. Both are "wiring" gaps, and
both are easy to introduce silently during a large rebuild where many
components get built in parallel across many sessions.

## Good news — reuse this, don't rebuild it

`app/src/lib/api/` is a separate layer from `app/src/components/` (22
typed client files: `clientCore.ts`, `clientModels.ts`,
`clientAudiobooks.ts`, `clientDubbing.ts`, and so on, plus `types.ts` for
shared types). This is very likely still intact even after the component
deletion in 03, since components and the API client layer are different
directories. **Confirm this first** — if it survived, treat it as the
reusable wiring layer: new components should call through these existing
typed client functions rather than hand-rolling `fetch()` calls inline. If
it didn't survive, or is significantly out of date against the backend's
current route surface, rebuilding it accurately (not from memory, from the
actual route definitions) is the first task here, before any UI work in 03
starts building against it.

## Scope

1. **Audit client-layer completeness against the real backend.** The
   backend has ~146 route handlers across 77 route modules. Generate the
   real route list from FastAPI's own OpenAPI schema
   (`GET /openapi.json` against a running backend, or
   `python -c "from backend.main import app; import json;
   print(json.dumps(app.openapi(), indent=2))"`) rather than grepping
   route files by hand — this is the authoritative, always-current list.
   Diff it against what `app/src/lib/api/*.ts` actually calls. Anything in
   the backend with zero frontend callers is a stranded endpoint — feed
   that list into 04's feature-exposure audit rather than duplicating the
   work, since "backend capability with no UI path" is exactly what that
   audit is for.
2. **Make wiring part of the Definition of Done (03).** Add to it
   explicitly: a component isn't finished until it's (a) mounted in the
   real router/navigation tree a user can actually reach, and (b) calling
   a real client function against a real backend route, not a mock or a
   TODO stub. This closes the "built but orphaned" direction of the
   problem.
3. **Make this checkable, not just a rule someone might forget.** A
   lightweight script (run in CI or on demand) that: (a) diffs the OpenAPI
   route list against `app/src/lib/api/` client functions and flags
   uncalled routes, (b) statically checks that every top-level page
   component under whatever the new routing structure is (03) is actually
   referenced by the router config, flagging anything defined but never
   imported into a route. Doesn't need to be fancy — a Node or Python
   script that fails loudly is enough; the point is catching drift
   automatically as the rebuild progresses, not relying on someone
   remembering to check at the end.

## Deliverable

Confirmed/rebuilt API client layer with full coverage against the real
backend route surface, "reachable and wired" added explicitly to 03's
Definition of Done, and a small CI-runnable script that catches orphaned
components and stranded endpoints going forward.
