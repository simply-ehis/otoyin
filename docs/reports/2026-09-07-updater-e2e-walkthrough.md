# Updater E2E — Failure Surface & Toast-Click UI Path (Walkthrough Log)

**Date:** 2026-09-07
**Status:** DONE — toast-click UI path and failure surface verified and pinned;
relaunch-on-real-installer remains open (see §5).
**Last verified:** 2026-09-07

Closes the last leg of `docs/reports/loop-logs/09-updater-hardening.md` flagged
in `LOOP_STATUS.md`: a written walkthrough of (a) the toast-click UI path —
the part that was silently broken by the dual-toast-store bug — and (b) the
failure surface. Companion to `2026-09-03-updater-audit.md` (wiring) and
`2026-09-07-updater-flow-verify.md` (harness).

## 1. Harness (recap, artifacts preserved in `/tmp/upd-e2e/`)

Real dev build driven against a locally faked update server — no mocks in the
path under test:

| Piece | Evidence |
|---|---|
| Fake update server (`fake_server.py`, port 8971) serving `latest.json` (0.3.0, `windows-x86_64`, minisign signature) + `otoyin_0.3.0_x64-setup.exe` + `.sig` | files present; `pre.txt` records the app's real plugin fetching `GET /latest.json 200` at 23:00:11 |
| Endpoint override | dev-only conf passed to `tauri dev --config`, repointing `plugins.updater.endpoints` at `http://127.0.0.1:8971` (pubkey unchanged — signature verification stayed real) |
| Real dev build | vite on 21132, Tauri webview live (`cdp.json`); 18 CDP probes (`probe.js`…`probe18.js`) drive the app; `probe18` navigates via the app's own router to `/settings` and surveys the updater controls |

## 2. The dual-toast bug this walkthrough existed to catch

The toast-click path was **rendering into the void**: `useAutoUpdater` pushed
its toasts through the canonical store (`@/ui/use-toast`), but the router
mounted the *legacy* toaster, which listened to a different legacy store with
its own module state — the "Update Available" toast never appeared even when
updater state was correct. Fixed by unifying on one store:

- `app/src/components/ui/use-toast.ts` is now a re-export shim of
  `@/ui/use-toast` (its header comment documents the incident);
- `router.tsx` mounts `<AutoUpdateFlow />` (line 475) next to the canonical
  `<Toaster />` (line 476);
- second real bug fixed in the same pass: `duration: Infinity` collapsed to a
  0 ms timeout (`setTimeout` ToInt32 coercion), so persistent toasts vanished
  instantly — `app/src/ui/use-toast.ts` now guards with `Number.isFinite`.
- pinned by 7 regression tests in `app/src/hooks/useAutoUpdater.test.tsx`
  ("AutoUpdateFlow toast wiring" ×4 through the *real* Toaster; "dual-store
  regression pins" ×3 including the Infinity-persistence pin).

## 3. Toast-click UI path — walkthrough

1. **Launch check.** `AutoUpdateFlow` (`features/settings/AutoUpdateFlow.tsx`,
   mounted once app-wide) calls `useAutoUpdater({ checkOnMount: true,
   showToast: true })` → `platform.updater.checkForUpdates()` → real
   `@tauri-apps/plugin-updater` `check()` → `GET /latest.json` against the
   configured endpoint. Verified live: fake-server log shows the fetch.
2. **Available → persistent toast.** On `status.available`, the hook emits
   "Update Available · Version 0.3.0 is ready to download." with a **Update
   Now** `ToastAction`, `duration: Infinity` (now genuinely persistent).
3. **Click "Update Now"** → `downloadAndInstall()` → `update.downloadAndInstall()`
   streams Progress events; `tauriPlatform.ts` accumulates
   `downloadedBytes/totalBytes` into `downloadProgress`.
4. **Toast morphs to progress** ("Downloading Update", pulsing icon, `<Progress>`
   bar, MB counter) — same toast instance, updated via `toastResult.update`,
   so it never re-enters the queue (`TOAST_LIMIT = 5` untouched).
5. **Ready → "Update Ready"** toast with **Restart Now** →
   `restartAndInstall()` → `relaunch()`. Windows exits during install and
   relaunches itself; macOS/Linux rely on this row (platform doc comment in
   `tauriPlatform.ts`).
6. **Manual path (production UI).** Settings → General → Updates section
   (`GeneralPage.tsx` `UpdatesSection`, `useAutoUpdater(false)`): Check for
   updates button (disabled while checking/downloading/ready, spinner while
   checking), status line (up-to-date / available vX / checking), inline
   Download row, Restart row, and a dev-mode variant that hides install
   actions. This row exercises the same seam, no toast.

## 4. Failure surface — walkthrough

| Failure | Observable behavior | Where |
|---|---|---|
| Manifest fetch fails (server down/bad JSON) | `status.error` set, `checking:false, available:false` | `tauriPlatform.ts` `checkForUpdates` catch |
| Signature/artifact mismatch | Plugin rejects; surfaced as `status.error` — **verified live**: the fake's 34-byte non-installer stub passed signature verification (key match) and was then correctly rejected by the install guard | audit report `2026-09-03-updater-audit.md` §verdict |
| Error with toast UX active | Destructive **"Update Failed"** toast showing the plugin error, 5 s auto-dismiss; hook then clears its toast id so the next cycle can re-toast | `useAutoUpdater.tsx` error effect + pinned by "error status surfaces the destructive Update Failed toast" |
| Error during launch check (no toast UX) | `showStudioErrorToast(error)` (house error handler) | `useAutoUpdater.tsx` `checkOnMount` catch |
| Error visible in Settings | Inline destructive error row under the Updates section (`ExclamationCircleIcon` + message) — non-blocking, dismisses on next successful check | `GeneralPage.tsx` `status.error` row |
| Download fails mid-stream | `downloading:false` + `error` set; progress toast replaced by the failure toast | `tauriPlatform.ts` `downloadAndInstall` catch |
| Relaunch fails | `status.error` via `relaunch()` catch | `tauriPlatform.ts` `restartAndInstall` |

Guardrails: `checkForUpdates` no-ops while `status.checking`;
`downloadAndInstall` no-ops without a live update or while already
downloading — double-click on Update Now cannot double-start.

## 5. What remains open (and why)

**Relaunch on a real signed installer.** The one unverified hop is the final
`relaunch()` on Windows performing a real install: the fake artifact is a
deliberate stub (rejected by the install guard after signature verification —
that rejection *is* the proven part). Closing it requires cutting a real
release artifact via the tag pipeline — owner has deferred local app builds
(2026-09-07), so this stays open, tracked in the audit report §5, and is
exactly the "install one artifact per OS family" step already listed for the
first tagged release. Everything before that hop — detect, verify, download,
UI surface, error surface — is proven.

Evidence retention: the harness files under `/tmp/upd-e2e/` are outside the
repo and may be cleaned by the OS; the durable proof is the 7-test regression
suite (in-repo) plus the fake-server log excerpt quoted in §1. Re-running the
harness is documented in `2026-09-07-updater-flow-verify.md`.
