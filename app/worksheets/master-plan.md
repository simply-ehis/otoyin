# Master Plan - Design Doc Remaining Work (in order)

PURPOSE: Track all remaining design-doc areas in order (§5 remainder → §6 → §7 → §8 → §10).
READ-WHEN: Before starting any slice, to confirm the next action and verify scope.
KEY-FILES: This worksheet only.
INVARIANTS: One slice at a time, each committed and gate-checked before the next (pre-commit scoped gate).
UPDATED: 2026-11-12

## Goal
Complete all remaining areas of `Otoyin Onboarding, Hidden Tabs, Search, Settings, Updater and Startup Design.md` in order, each slice committed with the pre-commit scoped gate green.

## Order (per design doc)

### §5 Settings (remainder) — DONE (committed 3c790771; compile-fixed dc20752a-era)
- S1: typed settings schema + JSON persistence (c3a278f9)
- S2: **Credential store** — Rust `keyring` 4.x (was unresolvable `1.4`); credential commands in settings.rs now compile (verified by cargo check on this tree); frontend credentialStore.ts + ApiKeysPage migrated; has_key flags only in settings.json. Live keyring roundtrip NOT verified on this machine yet (check passes; a live set/get/delete roundtrip against the real OS store would be the next proof).
- S3: **Schema-driven settings UI** — `/settings/schema` page + rail tab; full SETTINGS_SCHEMA rendering.
- S4: **Settings backup/export** — Export/Import JSON on the schema page.

### §6 Updater (stable-only) — DONE except live verification + release pipeline (7226b8d1, 4a9cfd09; install-on-quit added in the Rust slice)
- S1: banner (available/restart/error) outside Settings; auto-check 20 s + daily; What's-new toast.
- S2: restart disabled while job running; **Later installs on next quit** wired (updater_set_pending_install → CloseRequested applies download_and_install). **NOT:** minimum supported version (release-infra); endpoint 404s until a signed release publishes; live flow NEVER verified.
- S3?: Tauri updater plugin confirmed registered; pubkey/endpoint in tauri.conf.json; createUpdaterArtifacts on.

### §7 Space management (screen layout) — PART DONE (committed 64fb3657)
- Done: 44 px top bar w/ centred Ctrl+K box; 240/64 sidebar; 32 px group headers; one-row footer; history 48 px rail + count badge (desktop).
- NOT DONE: "Try an example" relocation; voice-picker action regroup; 8 px spacing pass.

### §8 Startup + loader (critical) — PART DONE (4dc9af4e, dc20752a, + Rust slice)
- S1: **Splash P0** — static inline splash in both index.html (logo + name + rose shimmer, no JS, theme-aware) shipped; App.tsx removes on first commit. <300 ms claim unverified by measurement.
- S2: **Boot order** — P1 on_launch wired; P2: backend-ready event (emit), crash-loop watchdog (persist counter, ≥2 → safe mode + banner + manual start), hidden-window watchdog (6 s w/o app_ready → force visible). useBootReadiness poller retained deliberately as the convergence path.
- S3: **Dynamic component loading safety** — lazyRetry/registry, RouteErrorBoundary + per-tab "Reload tab", lazyRoutes.test.ts (86 tests).
- NOT DONE / UNVERIFIED: visual splash check; live backend-ready/safe-mode/watchdog firing against a real run; boot timing measurements; P4/P5 deferral audit.

### §10 Help docs — DONE (061d4291 + 059a546d)
- TabTip one-time dismissible tips for every registry tab; TAB_HELP_DATA covers all 39 tabs + legacy; offline Help Center search (local catalog); ScreenHeader helpPath on effects/instruments/songwriter/GeneratePage only — per-tab "?" on remaining views unwired; HelpCenterOverlay article bodies not rewritten.

## Blocked / owner actions
- Release pipeline: signed latest.json publishing (updater endpoint 404 today) — owner's call.
- Minimum supported version: release-infra — owner's call.
- Visual smoke of the whole app (never run this session; gates are scoped, machine can't finish the full suite).
- IMPACT_MAP/knowledge docs: added 97-updater.md; this file keeps status current.

## Assumptions
- `just build-mcp-shim` or CI produces the MCP sidecar; local Rust verification used stubbed `binaries/` (gitignored).
- `bin/check.ps1` remains the gate; on this machine full runs don't finish — scoped pre-commit gates passed on every commit instead.
