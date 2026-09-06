# Loop log — 17-release-signing-and-notarization

## 2026-09-05 — PLAN
Re-read Context: no signing config at audit; two concrete reasons (OS warnings, updater trust).
Requires account/cost decisions — human territory.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| macOS sign+notarize | No `signingIdentity`/notarization config assertion in this pass; Apple Developer membership status unknown | BLOCKED (needs human account decision before engineering) |
| Windows Authenticode | OV/EV cert status unknown | BLOCKED (needs human cost/vendor decision) |
| CI wiring | `TAURI_SIGNING_PRIVATE_KEY` + updater-artifact signing in build.yml (updater package trust) — present. Full release-signing automation for installers NOT confirmed | IN PROGRESS (updater-key yes; installer-signing no) |
| Rebrand coordination | Bundle id intentionally still `com.21labs.app` (RENAME_LOG: needs release planning); productName `Otoyin Studio`. Signing identity vs final id: correctly DEFERRED, not broken | BLOCKED (same human release-planning decision) |

## AUDIT checkpoint
Clean-install test per platform after id/signing change: no changes in this pass. PASS (vacuous).

## Exit checklist — all open/blocked.
→ FILE BLOCKED (by design — paid certs + Apple membership + bundle-id release planning are all human decisions). Honest terminal state, not a failure.
