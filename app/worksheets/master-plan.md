# Master Plan — Design Doc Remaining Work (in order)

PURPOSE: Track all remaining design-doc areas in order (§5 remainder → §6 → §7 → §8 → §10).
READ-WHEN: Before starting any slice, to confirm the next action and verify scope.
KEY-FILES: This worksheet only.
INVARIANTS: One slice at a time, each committed and gate-checked before the next. No slice starts until the prior slice's gate passes 11/11.
UPDATED: 2026-11-11

## Goal
Complete all remaining areas of `Otoyin Onboarding, Hidden Tabs, Search, Settings, Updater and Startup Design.md` in order, each slice committed with gate passing 11/11.

## Order (per design doc)

### §5 Settings (remainder)
- S2: **Credential store** — Rust `keyring` integration for API keys; migrate ApiKeysPage from backend storage to OS credential store; JSON only records key existence.
- S3: **Schema-driven settings UI** — Generate settings pages from `SETTINGS_SCHEMA` (appearance presets, contrast guard, on-launch setting); migrate GeneralPage from hardcoded to schema-driven.
- S4: **Settings backup/export** — Export all settings as one JSON file (no keys); import; atomic write + .bak fallback.

### §6 Updater (stable-only)
- S1: **Update notification banner** — Calm banner outside settings ("Update 1.4.2 is ready. What's new?") with Restart now / Later; What's new note after update.
- S2: **Safety & policy** — Never restart while a job is running (wait or ask); Later installs on next quit; minimum supported version field; signature verification already present (pubkey in tauri.conf.json).

### §7 Space management (screen layout)
- S1: **Top bar + sidebar + history rail** — 44-48px top bar with centred Ctrl+K search; 240px sidebar / 64px collapsed; group headers 32px; one group open at a time; History thin collapsed rail with count badge.

### §8 Startup + loader (critical)
- S1: **Splash screen P0** — Native window + splash in <300ms, plain HTML/CSS, theme from config (no flash).
- S2: **Boot order P1–P5** — Settings/startup choice → backend handshake (`backend-ready` event, no polling) → first visible tab lazy chunk → idle prefetch → models/marketplace/update/stats later. Crash-loop watchdog (2 failed starts → safe mode). Hidden-window watchdog (5s → force visible + error page). Startup setting: New Generate / Last tab / Library.
- S3: **Dynamic component loading safety** — Typed route registry, retry once on chunk load failure, per-tab error with Reload tab, build test importing every lazy route, smoke test opening every enabled tab.

### §10 Help docs
- S1: **Help articles + per-tab tips** — Searchable offline Help section; `?` on every tab opens its article (what it does, 3-step quick start, presets, common fixes); tip shown once per tab, dismissible; What's new after updates.

## Assumptions
- Tauri updater plugin already wired (pubkey + endpoint in tauri.conf.json, TauriUpdater class, useAutoUpdater hook, GeneralPage UpdatesSection) — §6 mainly needs UI polish + safety policy.
- `keyring` crate is available in backend Cargo.toml (it's in requirements.lock; check Cargo.toml).
- Existing `SETTINGS_SCHEMA` has only `theme`; new settings added per slice.
- All existing gate steps (biome format, tsc, ruff, pytest, vitest) must pass 11/11 after each slice.

## Biggest Risk
The credential store (Rust `keyring`) may not compile on Windows without additional setup; or tauri.conf.json version mismatch (already seen blocking `cargo test`). Fallback per doc: "if too hard or complex use a jsonc" — JSON only records key existence, encrypted file fallback.

## Open Questions
- Does the owner want the credential store to replace the backend API key storage (ApiKeysPage posts to backend) or supplement it?
- What's the exact on-launch setting storage location (settings.json key `on_launch`)?
