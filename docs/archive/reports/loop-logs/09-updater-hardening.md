# Loop log — 09-updater-hardening

## 2026-09-05 — PLAN
Re-read Context: updater exists (Tauri plugin, good foundation); 5 eslint-disables intentional;
audit-and-harden posture. Commits `58c58d8` (shell wired with plugin) + `cc54863` (auto-check on launch) in history.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Channel/manifest readiness | `tauri.conf.json` updater block: real `endpoints` + real `pubkey` (not placeholder); `createUpdaterArtifacts:true`; CI `TAURI_SIGNING_PRIVATE_KEY` wired (build.yml:138-140). HTTPS-ness of endpoint + key-vs-artifact match NOT re-verified in this pass | IN PROGRESS (config present; endpoint/key-match proof pending) |
| UX audit | `useAutoUpdater.tsx` + `tauri/src/platform/updater.ts` exist; available→download→restart walkthrough NOT logged | NOT STARTED |
| Rollback/failure surface | Corrupt/mismatched-artifact test NOT run | NOT STARTED |
| Rebrand coordination | Bundle id still `com.21labs.app`, productName `Otoyin Studio` (intentional per RENAME_LOG — id change needs release planning). Old-identifier→rebrand update path NOT tested | IN PROGRESS (decision recorded; path test pending) |

## AUDIT checkpoint
Full update flow (success + failure) after any change here or in 02: no changes in this pass. PASS (vacuous).

## Exit checklist — all open (1 partial).
→ FILE IN PROGRESS. Note: unit 4 depends on the 17-signing human decision (bundle-id change = release planning).

## 2026-09-07 — E2E walkthrough log (last leg)
Full walkthrough written: `docs/reports/2026-09-07-updater-e2e-walkthrough.md` (failure surface + toast-click UI path, header convention). Load-bearing find during verification: the **dual-toast-store bug** — updater toasts rendered into the void because the router mounted the legacy toaster while `useAutoUpdater` pushed through the canonical store. Fixed (shim + canonical Toaster mount) + `duration: Infinity` 0ms-coercion bug; both pinned by 7 regression tests through the real Toaster (`useAutoUpdater.test.tsx`). Plugin-level harness (faked server, real dev build): detect → signature-verified download → install-guard rejection all proven; failure surface mapped (destructive toast, Settings error row, launch-check `showStudioErrorToast`, double-click guards).
Only remaining hop: `relaunch()` on a **real** signed installer (fake artifact is a deliberate stub) — folded into the first-tagged-release install test; deferred per owner's no-build call.

## Exit checklist (updated)
- [x] Walkthrough log: failure surface + toast-click UI path (2026-09-07)
- [x] Toast wiring regression-pinned (7 tests, dual-store pins)
- [x] Plugin-level E2E vs faked server (detect → verified download → install guard)
- [ ] `relaunch()` on a real signed installer (needs first tagged release)
→ FILE IN PROGRESS (one hop, blocked on a release cut).
