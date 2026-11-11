# Worksheet — S6 Updater (stable-only)

STATUS: COMPLETE (committed in 7226b8d1). Live verification NOT done — banner never observed rendered; tauri.conf.json has updater endpoints but no live release flow was exercised.

## What the design doc S6 requires vs what shipped

| Doc requirement | Status |
| --- | --- |
| Quiet check after startup idle 15–30 s, then ~once a day | DONE — `useAutoUpdater({ autoCheckDelay: 20000, autoCheckInterval: 86400000 })` in UpdateBanner; background checks fail silently |
| Settings also has Check for updates | ALREADY EXISTS (UpdatesSection in GeneralPage) — untouched |
| Calm banner + Restart now / Later | DONE — `UpdateBanner` mounted in AppFrame; What's-new link to /whats-new; Later/× dismiss for session |
| Background download + progress + signature verified | ALREADY EXISTS (tauri-plugin-updater; `downloadAndInstall`; signature = plugin) |
| Never restarts while a job is running | DONE — banner disables while `isPlaying` OR `generationStore.activeGenerationId !== null`; design asks it to "wait or ask" |
| "Later" installs on the next quit | NOT WIRED — requires Rust `on_window_event` quit hook calling plugin `install()` after `download()` (split download/install). tauri-plugin-updater supports split; current `tauriPlatform.ts` calls `downloadAndInstall` combined. True install-on-quit is follow-up work (owner decision: Rust quit hook vs UX change). |
| What's new note shows once after update | DONE — `usePostUpdateNotice` toast on version change; fresh installs recorded silently; navigates to /whats-new |
| Failure keeps current version + Retry + no nag | DONE — error state row with Retry; dismiss = no nag (session) |
| Minimum supported version | NOT IN THIS REPO — needs `latest.json` (release manifest) + server-side handling; tauri updater has no min-version field natively. Release-infra follow-up, not code here. |
| Stable channel only | HELD — single endpoint in tauri.conf.json; no beta wiring added |

## Files
- `app/src/hooks/useAutoUpdater.tsx` — options object gains `autoCheckDelay` / `autoCheckInterval` (backwards-compatible with boolean API)
- `app/src/layouts/Banner/UpdateBanner.tsx` (new) — mounted in `AppFrame.tsx` after `<BackendStatusBanner />`
- `app/src/hooks/usePostUpdateNotice.tsx` (new) — mounted in AppFrame
- `app/src/layouts/Banner/TopBanners.tsx` — update = priority 4 (note: TopBanners is not mounted anywhere; AppFrame mounts UpdateBanner directly — TopBanners wiring kept minimal)
- `app/src/layouts/AppFrame/AppFrame.tsx` — imports + mounts
- `app/src/i18n/locales/*/translation.json` — `updater.*` × 9 locales (staged updater hunks only; concurrent session's `sidebar.*` keys left unstaged)
- `app/src/i18n/locales/en/translation.json` — also `settings.schema.*` (S5 S4) from prior staging

## Verification (honest)
- `npx tsc --noEmit` → exit 0 (full repo)
- `npx biome check --write` on touched files → clean (3 fixed, then clean)
- vitest `useAutoUpdater.test.tsx` + `i18nKeys.test.ts` → 8/8 pass
- Pre-commit scoped gate: 11/11 PASS (biome, typecheck OK, ruff, backend+frontend scoped tests)
- NOT VERIFIED: banner rendering in the real app; live update flow (check/download/install) against a real release; "install on quit" behavior does not exist yet — do not claim it.

## Blocked / follow-ups
- Rust-side quit hook for true "Later installs on quit" (needs owner go-ahead; touches Rust window-event path + split download/install in tauriPlatform.ts)
- `latest.json` minimum-version handling = release pipeline work, not app code
- IMPACT_MAP.md not updated in the commit — file is mid-edit by a concurrent session (contains their uncommitted audit entry); update it when that session commits.

