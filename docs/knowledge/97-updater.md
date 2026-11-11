# 97 - Updater (S6) — calm update notice + What's new after update

PURPOSE: Document the in-app updater UX delivered for design doc "S6 Updater" (stable channel only). READ-WHEN: touching useAutoUpdater, UpdateBanner, or the AppFrame banner stack. KEY-FILES: app/src/hooks/useAutoUpdater.tsx, app/src/layouts/Banner/UpdateBanner.tsx, app/src/hooks/usePostUpdateNotice.tsx, app/src/layouts/AppFrame/AppFrame.tsx. INVARIANTS: never restart while isPlaying or an active generation exists; background checks never surface failures; no consent UI, no extra channels. GOTCHAS: TopBanners is dead code (never mounted) — AppFrame mounts UpdateBanner directly; `"Later" installs on quit` is NOT wired (needs Rust quit hook + split download/install); `"minimum supported version"` is release-infra (latest.json), not app code. UPDATED: 2026-11-11

## What shipped

- `useAutoUpdater(options)` gained `autoCheckDelay` (ms after mount before the quiet check) and `autoCheckInterval` (ms between checks). Defaults remain off; GeneralPage and the boolean API are unchanged.
- `UpdateBanner` (AppFrame, below `BackendStatusBanner`) states:
  - **available** — "Update {version} is ready" + `What's new?` → `/whats-new`; `Update now` disabled while busy; `Later`/× dismiss for session.
  - **readyToInstall** (downloaded) — `Restart now` (disabled while busy) or `Later`.
  - **error** — failure row with `Retry`; never nags beyond the current session.
- Busy = `playerStore.isPlaying || generationStore.activeGenerationId !== null`.
- `usePostUpdateNotice` — on launch, compares `platform.metadata.getVersion()` with `localStorage["otoyin.updater.seenVersion"]`; records fresh installs silently, fires a one-time toast + `/whats-new` action on version change.
- i18n `updater.*` × 9 locales (en/de/es/fr/ja/ko/pt-BR/zh-CN/zh-TW): updateAvailable (with `{{version}}`), readyToInstall, whatsNew, updateNow, restartNow, later, dismiss, updateBusy, updateFailed, retry, newVersionTitle, newVersionBody.

## What did not ship (by design / scope)

- Split `Update.download()` / `Update.install()` + Rust `on_window_event` quit hook → real "Later installs on next quit". Follow-up with owner.
- `latest.json` minimum-version handling — belongs to the release pipeline, not this repo.
- Beta channel — owner decided stable only.

## Verification

- `tsc --noEmit` exit 0; biome clean on touched files; vitest `useAutoUpdater` + `i18nKeys` 8/8; scoped pre-commit gate 11/11.
- NEVER verified visually or against a live release; treat runtime behavior as unproven until smoke-tested on the real app.
