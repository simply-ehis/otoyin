# Otoyin Redesign — Agent Prompt Pack

This is a set of prompt files for coding agents (Claude Code, Cursor, Codebuff,
whatever you point at the repo). Each file is self-contained: give an agent
just that one file + repo access and it has what it needs. Do not hand an
agent the whole folder at once — sequence matters, and context budget matters
more with a repo this size (275+ frontend components, ~100 backend route/model
files).

This pack was written from a real audit of `21-labs-clean.zip` on 2026-09-03.
Every claim below (bug, file path, existing behavior) was verified against
the actual repo, not assumed. Where something you asked for turns out to
already be partially built, the relevant file says so — no point having an
agent rebuild what's already there.

## Ground rules for every agent (put these in the agent's system/instructions)

- **Ponytail philosophy** (your existing rule, keep enforcing it): minimum
  files, surgical additions, every piece independently deletable, nothing
  added until needed.
- **Offline-first, low-end-device target.** Nothing in the redesign should
  assume a fast GPU or always-on internet.
- **No floating UI, no glassmorphism/transparency.** No `backdrop-blur`,
  no `bg-white/NN` or `bg-black/NN` translucency tricks, no floating pills
  or panels that hover disconnected from the layout. Use real surfaces and
  smooth transitions (position/opacity/height animations that resolve to a
  concrete state) instead of translucent floaters.
- **Zero-placeholder policy stays enforced.** The repo already has
  `backend/scripts/check_placeholders.py` as a CI gate (TODO/FIXME/HACK/XXX
  banned outside one allowed exception). Any new code respects that gate.
- **No Lucide icons** — this is already a rule in your `desktop-ui-design-skills`
  package; the redesign should pull from that skill pack directly rather than
  agents re-deciding icon strategy each time.
- Every prompt file below produces a **plan or a diagnosis**, not a merged
  fix, unless the file explicitly says to implement. You said you don't want
  fixes done yet — only 01 (bug audit) is written as "go verify and log
  findings," nothing auto-applies changes.

## Suggested order

Numbers indicate dependency, not literal calendar order — some of these can
run in parallel with different agents/sessions.

1. **01-audit-bugs-and-connection-reliability.md** — do this first, always.
   Cheap, low-risk, and every later prompt benefits from a clean baseline.
2. **02-rebrand-to-otoyin.md** — do the backend/non-UI half of this early
   (env vars, Python, marketplace, CI, docs). The frontend half of the
   rebrand happens naturally as part of 03, since the whole frontend is
   being rebuilt from nothing anyway.
3. **03-full-frontend-rebuild.md** — decided: staying on React, old
   components archived and deleted to force a real from-scratch rebuild
   (no framework swap). This is now the foundational prompt everything
   else in the pack sits on top of.
4. **04-design-system-and-redesign.md** — the canonical component library
   and design tokens 03 explicitly requires be built *before* any screen.
   Read 03's "build order" section — 04 is step 1 of that order, not a
   separate later pass.
5. **05-audio-studio-page-redesign.md** — the flagship page, deliberately
   built last per 03's build order, once the architecture and component
   library are proven on simpler screens.
6. **06-model-lifecycle-optimization.md** — backend-only, can run any time,
   in parallel with 03/04/05.
7. **07-marketplace-redesign-and-backend.md** — UI depends on 04; backend
   half is independent.
8. **08-notifications-backend.md** — independent, new service.
9. **09-updater-hardening.md** — independent, audits what's already there.
10. **10-payments-migration.md** — independent but time-sensitive (revenue).
    Coordinate with 07 since both touch the marketplace backend.
11. **11-help-onboarding-skills-exposure.md** — needs the final UI shape,
    do near the end.
12. **12-deployment-and-setup.md** — depends on 08 and 10 landing.
13. **14-testing-strategy-for-rebuild.md** — run *alongside* 03/04/05, not
    after. Tests are part of each component's Definition of Done, not a
    separate later pass — see the file for why.
14. **15-accessibility.md** — bake into 04's component library as it's
    built, same reasoning as 14: cheapest now, expensive if bolted on later.
15. **16-security-and-secrets-hardening.md** — the marketplace-admin-auth
    and MCP-auth parts should land alongside 07/08; the dependency-scanning
    part can run any time CI is being touched (03's bun→npm cleanup already
    touches CI, good opportunity to do both at once).
16. **17-release-signing-and-notarization.md** — do after 02's rebrand
    settles the final bundle identifier/product name; before your first
    real public release.
17. **18-privacy-and-data-compliance.md** — do alongside or right after 10
    (payments), since both concern the same marketplace account data.

18. **19-environment-and-build-reproducibility.md** — run alongside 03's
    bun→npm cleanup, same category of problem (dependency/toolchain drift).
19. **20-component-wiring-and-integration.md** — the "reachable and wired"
    rule folds directly into 03's Definition of Done; do this as soon as
    the API client layer's survival/state is confirmed (early in 03).
20. **21-small-model-harness.md** — pairs with 06 (model lifecycle) and 14
    (testing) — the lifecycle-integration decision and the test-coverage
    gap both hand off to those files rather than duplicating them.

## What's in this pack

| File | Covers |
|---|---|
| 01 | Bug audit + why the connection is flaky |
| 02 | Full rename 21-labs / TwentyLabs / Di Stefano → Otoyin |
| 03 | Full frontend rebuild from scratch (React, old components deleted), bun → npm |
| 04 | UI/component/color-scheme redesign, no floating/transparent |
| 05 | Audio Studio (editing) page — focused redesign |
| 06 | Model backend loading optimization (cached=true, single-model runtime load) |
| 07 | Marketplace redesign + remote-catalog backend + auto-download hard rule |
| 08 | Push notification backend (not bundled in app updates) |
| 09 | Updater logic audit/hardening |
| 10 | Payment provider migration off PayProGlobal (Nigeria-friendly options) |
| 11 | Help sections, onboarding, skills exposure |
| 12 | Deployment + setup docs |
| 14 | Testing strategy for the rebuild — thin/orphaned test coverage, gap found in a follow-up scan |
| 15 | Accessibility, baked into the rebuild rather than bolted on |
| 16 | Security & secrets hardening — MCP/admin auth, webhook signature consistency, dependency scanning |
| 17 | Release code signing & notarization (macOS/Windows) — currently unsigned installers |
| 18 | Privacy & data compliance for marketplace accounts (GDPR-style export/deletion) |
| 19 | Environment & build reproducibility — "works on my PC" gaps: loose dependency pinning, unpinned Rust toolchain, asymmetric env checks |
| 20 | Component wiring — no orphaned components, no backend endpoints with zero frontend callers |
| 21 | Harness for the small bundled models (DeepFilter/Demucs/VAD/LavaSR) — duplicate implementations, no lifecycle management, thin tests |

Files 14–21 came from two follow-up gap-finding passes after the original
13 were delivered — see each file's context section for what was actually
found in the repo. No files 13 or (originally) 14–18 renumbering — kept
stable so nothing already in flight has to be re-pointed.

A new `README.md` (with a new tagline) is included separately in this zip,
ready to drop into the repo root — that one's already written, not a prompt.
