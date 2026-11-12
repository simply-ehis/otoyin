# Worksheet — §8 Startup + Loader

STATUS: P0 splash shipped (static inline); P2 backend-ready/watchdogs shipped (Rust, compiles); P1 on_launch shipped earlier. NOT: zero-poller (poller retained intentionally), live verification, splash visual check.

## Delivered
- **P0 (partial, frontend-only per owner decision):** inline static splash in `app/index.html` and `tauri/index.html` (logo + wordmark + rose shimmer bar, dark/light, reduced-motion respected), painted before the JS bundle; `App.tsx` removes it on first commit+effect. No second window, no Rust, no tauri.conf.json.
- **P2 backend-ready:** `server::ensure_started` result matched in lib.rs setup spawn; emits `backend-ready` (URL) on success, `backend-failed` (error) on failure, and `backend-safe-mode` when the persisted consecutive-failure counter hits 2. Poller in `useBootReadiness` intentionally kept as the convergence path.
- **Crash-loop watchdog:** consecutive auto-start failures persisted to `<appData>/startup-health.json` (`{ consecutive_backend_failures: N }`). On launch, if N ≥ 2, backend auto-start is SKIPPED and `backend-safe-mode` is emitted; `BackendStatusBanner` shows "Start engine anyway" (invoke restart_server). Success resets the counter to 0.
- **Hidden-window watchdog:** `app_ready` command (renderer signals commit on mount via AppFrame effect). After 6s without it, Rust forces the window visible and emits `startup-watchdog`.
- **S3 (earlier commit dc20752a):** lazyRetry + RouteErrorBoundary + lazyRoutes.test.ts.

## Verification (honest)
- cargo check green (keyring 4.2.0 compiles; windows-native-keyring-store builds; credential commands in settings.rs compile).
- cargo test result TBD at time of writing (running).
- UNVERIFIED live: splash pixels, backend-ready timing, watchdog firing, safe-mode UX against a real failing backend.

## Known exclusions / decisions
- Poller stays (Rust event only accelerates + marks failure; fallback path unchanged).
- `backend-ready` has no consumer that changes behavior yet beyond parity start; crash-loop safe mode IS consumed by BackendStatusBanner.
- `/health/ready` still drives "Backend is starting" banner.
