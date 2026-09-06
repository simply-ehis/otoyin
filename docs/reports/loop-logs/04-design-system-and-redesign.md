# Loop log — 04-design-system-and-redesign

## 2026-09-05 — PLAN
Re-read Context + hard constraints. Skill pack referenced (`desktop-ui-design-skills`) is consumed
via REBUILD_LOG rule 6 (19 skills, heroicons-only, banners-not-floaters). Baseline: 58 files with
blur/translucency at audit time.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Design tokens | `app/src/styles/tokens.css` `:root` semantic tokens (`--surface-base --surface-raised…`, hsl 28 warm neutrals, flat rose hsl 348); `docs/design/proof/proof.html` face; zero hardcoded hex in new `ui/` | PASS |
| Canonical library + sign-off | 34 `ui/` files + vitest floor + `check-ui-test-floor.py`; explicit demo-proof rule (vitest, no demo route). Sign-off = locked arch decisions in REBUILD_LOG (reviewed state). Treating as PASS with sign-off = REBUILD_LOG lock | PASS |
| Layout/overflow | translucency grep `app/src`: 58 → **8**. Remaining: 3 old-tree (FeatureTour, MiniGame, ServerTab) + 2 old `components/ui` (alert-dialog, dialog) + 3 NEW `ui/` overlays (alert-dialog:26, dialog:29, drawer:39 — all `bg-black/60` modal scrims). Scrims are explicitly exempt per REBUILD_LOG rule 6 ("modal scrims exempt per surfaces-overlays"). Effective remainder: 5 old-tree files. | IN PROGRESS (5 left, all old-tree, deleted as screens land) |
| Notification/banner | `ui/banner.tsx` canonical banner + toast 4s rule in arch decisions; `AnnouncementBanner.tsx` exists. Old `components/ui/use-toast` parallel-run status: NOT yet verified removed | IN PROGRESS |
| Feature-exposure audit | `docs/reports/2026-09-03-feature-exposure-audit.md` exists; per-entry marked/feeding-03 status NOT yet verified | IN PROGRESS |

## AUDIT checkpoint (every unit — floating/transparency grep)
Count strictly decreasing (58→8), never regressed. New-code additions are exempt scrims only. PASS.

## Exit checklist
- [ ] Zero non-exempt translucency (5 old-tree files left)
- [x] Canonical components consume tokens, none hardcode
- [ ] Feature-exposure checklist fully marked → feeds 03/20
→ FILE IN PROGRESS.
