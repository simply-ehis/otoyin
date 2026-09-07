# Loop Status Dashboard — Otoyin Redesign Pack

**Protocol:** `LOOP-PROTOCOL.md` in `C:\Users\ehis\Downloads\otoyin-redesign-prompts`
**Sequencing:** `00-START-HERE.md` in the same pack.
**Updated:** 2026-09-07 (rows 03/04/06/09/14 refreshed 2026-09-06/07; report-header convention applied across docs/reports/ — see README.md there).
**How to resume:** read this file first, then `docs/reports/loop-logs/<slug>.md` for the file you're picking up.

| File | Status | Current unit | Last updated | Notes |
|---|---|---|---|---|
| 01-audit-bugs-and-connection-reliability | IN PROGRESS | unit 4/6 | 2026-09-05 | findings docs exist; pkg-mgr + payments + Rust-BUG verified PASS; i18n/test-isolation/conn-verdicts need re-check (see log) |
| 02-rebrand-to-otoyin | DONE (with documented exceptions) | 7/7 | 2026-09-05 | env fallback, alias, title, order_ref, MCP, skills-count PASS; batch-grep remainder = intentional wire-protocol names per RENAME_LOG; bundle-id/spec/URLs left for versioned migration |
| 03-full-frontend-rebuild | IN PROGRESS | unit 4/8 | 2026-09-06 | Step0+arch+tokens+shell done; screens landing into features/ (store, launcher, audioStudio partial); translucency hits zero after 06 pass; bun→npm DONE |
| 04-design-system-and-redesign | IN PROGRESS | unit 3/5 | 2026-09-06 | tokens file exists; canonical ui/ (34 files) + tests exist; translucency 58→0 + raw-palette text & border/ring sweeps done, rules codified in DESIGN_SYSTEM.md; notification + feature-audit units pending verify |
| 05-audio-studio-page-redesign | NOT STARTED | unit 0/5 | 2026-09-05 | flagship still on old tree; blocked behind 03/04 per build order — correct, not a slip |
| 06-model-lifecycle-optimization | IN PROGRESS | unit 2/4 | 2026-09-06 | mark_model_used callers present (15+ sites); `cached`/`local_status` implemented + tested (catalog annotation, Store states, manifest-backfill reconciliation) — was the unit-1 real gap |
| 07-marketplace-redesign-and-backend | IN PROGRESS | unit 2/4 | 2026-09-05 | remote catalog fetch exists (marketplace.ts → /v1/catalog); notices.py + privacy page exist; gating audit + admin e2e pending |
| 08-notifications-backend | IN PROGRESS | unit 3/4 | 2026-09-05 | announcements.py has remote-merge (OTOYIN_NOTICES_URL) + notices.py exists; e2e push + offline-silence need explicit test log |
| 09-updater-hardening | IN PROGRESS | unit 2/4 | 2026-09-06 | pubkey + endpoints + CI signing confirmed; plugin-level E2E vs faked server (detect→verified download→install guard) — walkthrough log for failure-surface + toast-click UI path still needed |
| 10-payments-migration | DONE (code) / BLOCKED (business) | 4/5 | 2026-09-05 | Paddle checkout+webhook+sig-verify in code; legacy Stripe deleted; sandbox-purchase + payout-signup need human (money decision) |
| 11-help-onboarding-skills-exposure | NOT STARTED | unit 0/4 | 2026-09-05 | help.py exists; no verification pass run yet |
| 12-deployment-and-setup | DONE | 4/4 | 2026-09-05 | DEPLOY.md updated 2026-09-04 (npm-only, 3 services, migration note); env table present |
| 14-testing-strategy-for-rebuild | IN PROGRESS | unit 2/4 | 2026-09-06 | ui floor LIVE-PASS (26 comps); backend 129 files; full vitest run 477/477 green (2026-09-06, ~209s — pre-commit budget note); NO e2e dir (real gap) |
| 15-accessibility | NOT STARTED | unit 0/5 | 2026-09-05 | no a11y pass logged against new ui/ library yet |
| 16-security-and-secrets-hardening | IN PROGRESS | unit 1/5 | 2026-09-05 | Paddle webhook verify exists in code; MCP trust model + admin-auth attack tests + dep-scan gate not yet demonstrated |
| 17-release-signing-and-notarization | BLOCKED | unit 2/4 | 2026-09-05 | updater signing key wired in CI; macOS notarization + Windows Authenticode need paid certs/human account decision |
| 18-privacy-and-data-compliance | IN PROGRESS | unit 1/4 | 2026-09-05 | marketplace/web/src/app/privacy/page.tsx exists; deletion/export walkthrough + provider-coverage note pending |
| 19-environment-and-build-reproducibility | DONE | 5/5 | 2026-09-07 | requirements.lock (uv universal, 131 pins) validated on locked env (122/122); CI installs + audits the lock; path audit: 3 Windows-breaking rsplit bugs fixed; onnxruntime-coreml unsatisfiable pin removed (was breaking fresh macOS installs) |
| 20-component-wiring-and-integration | IN PROGRESS | unit 3/4 | 2026-09-05 | check-wiring.py LIVE-RUN (74 routers, 434 paths, 98 stranded=mid-flight); deliberate self-test + DoD spot-check pending |
| 21-small-model-harness | NOT STARTED | unit 0/4 | 2026-09-05 | duplication still present (both deepfilter + both stem files); only test_vad.py; no lifecycle/measurement decision |
