# Worksheet — §8 Startup + Loader

STATUS: P0, P1, P2, P3, P4/P5 done; NOTHING verified against a live app run.

## Delivered
- **P0 (static inline splash):** both index.html shells (logo + wordmark + rose shimmer; dark/light; reduced-motion; theme-aware via the existing pre-paint script); App.tsx removes it on first React commit. No second window, no tauri.conf.json window/splash config.
- **P1 (startup choice):** `appearance.on_launch` — new_generate (default, current behavior) / last_tab (registry-tab restore via localStorage) / library; RootLayout `useStartupRoute`; committed 4dc9af4e.
- **P2 (boot order):** Rust spawn matches on `ensure_started` result — emits `backend-ready` (url) / `backend-failed` (error); consecutive-failure counter persisted at `<appData>/startup-health.json`; >=2 failures -> auto-start SKIPPED and `backend-safe-mode` emitted; `BackendStatusBanner` shows "Start engine anyway" (invoke `restart_server`); success resets the counter. Hidden-window watchdog: `app_ready` command from AppFrame on mount; after 6s without it the window is forced visible + `startup-watchdog` emitted.
- **P3 (component loading safety):** lazyRetry (one 150ms retry per chunk) on all route lazy imports; RouteErrorBoundary around the outlet with per-tab "Reload tab"; `lazyRoutes.test.ts` pins the graph (every dynamic import resolves; every registry tab has a route).
- **P4/P5 (this slice):** boot chunk no longer statically imports any feature module; all 40+ pages are lazy chunks; `lazyRoutes.test.ts` enforces via a P5 boundary test (no static `@/features/...` import in router.tsx).
- **S8 S3 (earlier commit dc20752a).**

## Verification (honest)
- cargo check green; cargo test 18/18; scoped pre-commit gate 11/11 on every commit; vitest lazyRoutes 109/109; tsc exit 0.
- UNVERIFIED live: splash pixels, backend-ready/safe-mode/watchdog firing against a real run, boot timing measurements. The machine never ran the full gate; the app has never been started this session.

## Not done (deliberately)
- Boot-order instrumentation / real measurements of P0/P1/P2 budgets (needs live runs + release probes).
- "Engine starting" per-tab placeholder states for failed tabs (doc's P2 queueing nuance) — route errors surface via RouteErrorBoundary instead.
