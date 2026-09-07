# Help / Skills Exposure Audit (prompt 11, backend slice — 2026-09-04)

**Date:** 2026-09-04
**Status:** DONE — backend verified render-ready; the surfaced gap closed
2026-09-07 (`app/src/features/help/`: HelpCenter, HelpPage, SkillsBrowser).
**Last verified:** 2026-09-07

No backend work needed. Everything below already exists and is shaped for
rendering; the gap is purely that the **new tree has no surfaces for it**.

## Backend (verified, structured, render-ready)

- `GET /help/features` → `{version, features[]}` — full feature catalog
  from JSON (`backend/routes/help.py:89`). `GET /help/search?q&limit` →
  `{query, results[]}` (max 5, same fields).
- `GET|POST /skills`, `GET|PUT|DELETE /skills/{id}` — full custom-skill
  CRUD with sanitized IDs (`backend/routes/custom_skills.py`).
- `GET /shortcuts/keymaps`, `POST /shortcuts/keymap` — keymap data.

## Client layer (complete)

- `clientHelp.ts`: `getHelpFeatures()`, `searchHelp()` — both covered.
- `clientSkills.ts`: list/get/create/update/delete — all covered.
- Shortcuts: `listKeymaps()`/`getKeymap()` covered **and consumed** by
  new-tree `features/settings/ShortcutsPage.tsx` — the one surfaced item.

## UI gap (new tree)

- Old tree only: `components/Help/HelpCenter.tsx` (catalog + search),
  `components/Assistant/SkillBuilder.tsx` (browser/manager).
- New tree `features/` (14 areas) has **zero** help/skills call sites.
- Keyboard-shortcuts content (`docs/knowledge/72-*`) is exposed via the
  ShortcutsPage above — done, no action.

## Recommendation for the rebuild owner

When the Help/Support slice lands: build the in-app help center on
`getHelpFeatures`/`searchHelp` and the skills browser on the skills CRUD
— no new backend required. Onboarding's "first audio in N steps" flow
should deep-link those surfaces (feeds the 04 exposure audit). Do not
rebuild content models; extend only if the catalog JSON proves too thin.
