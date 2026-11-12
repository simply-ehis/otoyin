# Master Plan - Design Doc Remaining Work (in order)

PURPOSE: Track all remaining design-doc areas in order (§5 remainder → §6 → §7 → §8 → §10).
READ-WHEN: Before starting any slice, to confirm the next action and verify scope.
KEY-FILES: This worksheet only.
INVARIANTS: One slice at a time, each committed and gate-checked before the next (pre-commit scoped gate). NOTE: another agent session is editing this same working tree concurrently; their uncommitted WIP (schema-driven settings expansion, CommandPalette, Composer, sidebar redesign) is never staged by this session.
UPDATED: 2026-11-12

## Goal
Complete all remaining areas of `Otoyin Onboarding, Hidden Tabs, Search, Settings, Updater and Startup Design.md` in order, each slice committed with the pre-commit scoped gate green.

## Status

### §5 Settings — DONE
- S1 schema + JSON persistence (c3a278f9); S2 credential store (keyring 4.x, compiles; ApiKeysPage migrated; has_key flags only); S3 schema-driven UI (/settings/schema); S4 backup/export (export/import JSON).

### §6 Updater (stable-only) — DONE except release pipeline + live verification
- Banner (available/restart/error) outside settings; auto-check 20 s + daily; job-aware restart; Later installs on next quit (Rust CloseRequested hook applies pending update); What's-new toast; min-version = release-infra (GitHub Releases publishes latest.json; owner said release pipeline not to-do now). The endpoint 404s until a signed release ships — the updater cannot find an update until then (owner action).

### §7 Space management — DONE
- Top bar 44 px + centred Ctrl+K; sidebar 240/64 + 32 px group headers + one-row footer; Generate history = 48 px rail + count badge; voice-picker actions (TabHelp/Record/Import/Create Voice) regrouped into the voice picker row; "Try an example" under the script box (3 chips fill the textarea) replacing the empty-history empty state; 8 px spacing pass on the shell + touched files (8/12/16/24 scale).
- NOT DONE: full-app 8 px sweep (this pass covered shell + touched files).

### §8 Startup + loader — DONE except live verification / boot measurements
- P0 static splash; P1 on_launch wired; P2 backend-ready + crash-loop watchdog + hidden-window watchdog (Rust); P3 lazyRetry + RouteErrorBoundary + lazyRoutes integrity tests (109 tests); P4/P5 no static feature imports in router.tsx (test-enforced).

### §10 Help docs — DONE
- TAB_HELP_DATA covers every registry tab + legacy routes (community presets, offers); TAB_TIP_DATA one-time dismissible tips for every registry tab (mounted in AppFrame); ScreenHeader `helpPath` wired on every header in the app (every tab header has a "?"); offline Help Center search (local catalog); What's-new after updates.

## Blocked / owner actions
- Release pipeline: publish signed release + latest.json (GitHub Releases) — owner's call; without it the updater is inert.
- Live verification of everything above (no app run this session; gates were scoped, not GATE_FULL).
- The concurrent session's WIP (settings search, CommandPalette, Composer, sidebar redesign) — not reviewed, not committed by this session.
