# Worksheet — §6 Updater

STATUS: COMPLETE except live verification; install-on-quit now wired (Rust CloseRequested hook).

## Delivered
- useAutoUpdater: `autoCheckDelay` (20 s after startup) + `autoCheckInterval` (~once a day); background checks fail silently.
- UpdateBanner (AppFrame): `available` → "Update X is ready" + What's-new link + Update now; `readyToInstall` → "Restart now"; `error` → quiet Retry row. Restart disabled while `isPlaying || activeGenerationId !== null`. What's-new and Update buttons route through the same banner.
- Later semantics (§6): clicking Later on a DOWNLOADED update calls `updater_set_pending_install(true)`; the Rust CloseRequested path (which already prevent_close + stops the bundled backend) applies the pending update via tauri-plugin-updater's check/download_and_install instead of destroying the window. Windows: installer replaces the app and relaunches (ShellExecute + process::exit(0) inside the plugin). Elsewhere: window destroyed; update applies on next launch. Failure → current version kept, app closes normally.
- usePostUpdateNotice: one-time What's-new toast after a version change; fresh installs recorded silently; links to /whats-new.
- i18n `updater.*` × 9 locales.
- Worksheets/knowledge docs: this file, docs/knowledge/97-updater.md, master-plan S6 entry.

## Verification (honest)
- tsc exit 0; biome clean; vitest useAutoUpdater + i18nKeys 8/8; lazyRoutes 86/86; scoped pre-commit gate 11/11.
- cargo check green (log: cargo_check_tauri11.log); cargo test result TBD.
- NEVER verified: check/download/install against a real release; updater endpoint `github.com/simply-ehis/otoyin/releases/latest/download/latest.json` returns 404 and the repo has no release with latest.json — **the updater cannot find an update until a signed release is published** (release-pipeline action, owner's call).
- Live run of the app has not happened this session.

## Not done (owner decisions)
- Minimum supported version in latest.json (release-infra).
- Anything about the update UI for admin-managed machines.
