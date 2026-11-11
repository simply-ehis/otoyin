# Master Plan - Design Doc Remaining Work (in order)

PURPOSE: Track all remaining design-doc areas in order (§5 remainder → §6 → §7 → §8 → §10).
READ-WHEN: Before starting any slice, to confirm the next action and verify scope.
KEY-FILES: This worksheet only.
INVARIANTS: One slice at a time, each committed and gate-checked before the next (pre-commit scoped gate). NOTE: another agent session is editing this same working tree concurrently (owns: DubTimeline/timeline utils, registry.ts, Sidebar.test, IMPACT_MAP.md, sidebar.* i18n keys — left unstaged by this session).
UPDATED: 2026-11-11

## Goal
Complete all remaining areas of `Otoyin Onboarding, Hidden Tabs, Search, Settings, Updater and Startup Design.md` in order, each slice committed with the pre-commit scoped gate green.

## Order (per design doc)

### §5 Settings (remainder) — DONE (committed in 3c790771)
- S1: typed settings schema + JSON persistence (done earlier, c3a278f9)
- S2: **Credential store** — Rust `keyring` commands (settings.rs), frontend credentialStore.ts, ApiKeysPage migrated to OS credential store, has_key flags in settings.json (committed 3c790771). NOTE: Rust side never compiled locally (pre-existing tauri.conf.json vs tauri-build mismatch blocks cargo test) — code follows server.rs pattern, unverified by compiler.
- S3: **Schema-driven settings UI** — SETTINGS_SCHEMA + SchemaSettingRow + SchemaSettingsPage (/settings/schema), appearance.* + api_keys.* keys (committed 3c790771)
- S4: **Settings backup/export** — Export/Import buttons on the schema page (JSON, no secrets pulled — only has_key flags), i18n schema.* keys (committed 7226b8d1)

### §6 Updater (stable-only) — DONE except releases-infra bits (committed 7226b8d1 + 4a9cfd09)
- S1: Update banner mounted in AppFrame ("Update X is ready" → What's new? link, Restart now, Later); auto-check 20 s after startup + daily; background checks fail silently (useAutoUpdater autoCheckDelay/autoCheckInterval); usePostUpdateNotice one-time What's new toast on version change (committed 7226b8d1)
- S2: Restart disabled while audio plays or a generation is in flight (isPlaying || activeGenerationId !== null); failure row with Retry, no nag. NOT DONE: "Later installs on quit" — needs Rust quit hook + split download/install (tauri-plugin-updater supports it; owner decision). "Minimum supported version" — release-infra work (latest.json), not app code. Live update flow NEVER verified end to end.

### §7 Space management (screen layout) — PART DONE (committed 64fb3657)
- S1: **Top bar + sidebar + history rail** — AppHeader h-11 (44px) with centered Ctrl+K search box; sidebar 240px default (fresh installs) / 64px collapsed icon rail; group headers h-8 (32px); single compact sidebar footer row (clipboard + game + collapse); GeneratePage history = thin collapsed rail (48px, count badge) on desktop; mobile unchanged (committed 64fb3657)
- NOT DONE: "Try an example" empty-state relocation; regrouping Learn/Record/Import/Create Voice actions into the voice picker (workspace view); 8 px spacing pass.

### §8 Startup + loader — PART DONE (committed 4dc9af4e + dc20752a)
- S1: **Splash P0** — NOT DONE (needs tauri.conf.json window/splash config — owner territory, needs approval)
- S2: **Boot order P1–P5** — PART: appearance.on_launch setting wired (new_generate default = current behavior; last_tab = restore last registry tab via localStorage; library = /library) in RootLayout via useStartupRoute. NOT DONE: backend-ready event (Rust), crash-loop watchdog (Rust), hidden-window watchdog (Rust), P5 deferral pass. useBootReadiness poller stays for now (works, shared ref-counted poller)
- S3: **Dynamic component loading safety** — DONE (dc20752a): lazyRetry (150 ms retry once) on all 43 lazy route components; RouteErrorBoundary around the route outlet (sidebar/shell survive a tab crash, single "Reload tab" = full reload); lazyRoutes.test.ts build-time integrity (every dynamic import resolves; every registry tab has a route; 86 tests)

### §10 Help docs — DONE (committed 061d4291)
- S1: **Help articles + per-tab tips** — TAB_HELP_DATA expanded to cover every registry tab (43/43); TAB_TIP_DATA one tip per tab + TabTip one-time dismissible tip bar mounted in AppFrame; Help Center offline search already served a bundled local catalog (/help/search); What's new after updates (S6)
- NOT DONE: `?` wiring inside every tab's ScreenHeader (effects/instruments/songwriter/GeneratePage have it; remaining views rely on TabTip + Help Center search); HelpCenterOverlay article bodies not rewritten

## Assumptions
- Tauri updater plugin already wired (pubkey + endpoint in tauri.conf.json, TauriUpdater class, useAutoUpdater hook, GeneralPage UpdatesSection) — §6 mostly needed UI polish + safety policy.
- `keyring` crate present in Cargo.toml (settings credential commands unverified — see §5 S2 note).
- Gate = pre-commit scoped checks (biome/typecheck/ruff/backend+frontend scoped tests). Full bin/check.ps1 could not complete on this machine 2026-11-11 (tsc > 90 s budget; full vitest did not finish in 1800 s).
- Another agent session is concurrently editing this tree; commits this session were assembled to exclude their files via staged-hunk filtering.

## Biggest Risk
Rust `keyring` code never compiled; tauri.conf.json vs tauri-build mismatch blocks cargo test. If the owner approves the tauri.conf.json fix (remove `license` field or bump tauri-build), compile-verify settings.rs credential commands before trusting the credential store.

## Open Questions
- Owner approval for Rust-side startup work (splash window P0, backend-ready event, watchdogs) — touches tauri.conf.json + Rust; currently frozen.
- "Later installs on quit" — acceptable to add a Rust on_window_event quit hook, or prefer a UX change?
- Whether to force-migrate persisted 220px sidebar widths to 240px for existing users (current: fresh installs only).
