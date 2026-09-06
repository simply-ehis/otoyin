# Help, Onboarding & Skills Exposure — Audit + Plan

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/11-help-onboarding-skills-exposure.md`
**Stage:** audit + plan. Everything the prompt feared was missing actually exists; the work is **surfacing it under the design system**, not building from zero.

## 1. What already exists (verified)

| Area | Backend | Frontend |
|---|---|---|
| In-app help content | `backend/routes/help.py` — serves `backend/data/app_features.json` (60 features, `where`/`tools`/`keywords`), with ranked `search_features()` shared by REST + `app_help` assistant tool + `21labs.help` MCP tool. **Not a stub — real structured content.** | `app/src/components/Help/HelpCenter.tsx`, `Help/CommandPalette.tsx` |
| Onboarding | — | `app/src/components/GettingStarted/GettingStarted.tsx`, `Help/FeatureTour.tsx` |
| Skills model + CRUD | `backend/routes/custom_skills.py` (list/get/create/update/delete, relevance scoring); model documented in `docs/knowledge/70-custom-skills.md` (triggers / steps / tools / pitfalls) | Skills UI exists in the assistant surface |
| Keyboard shortcuts | — | Settings `/shortcuts` (`ShortcutsPage`); content in `docs/knowledge/72-keyboard-shortcuts.md`; `CommandPalette` can expose it |

## 2. Gaps and what to change (redesign work)

1. **Help center** — restyle `HelpCenter` to the 04 design system; it already
   consumes the feature catalog, so the work is presentation (grouping by the
   manifest's `category`, per-feature "where to find it" cards, search with the
   canonical input pattern). The catalog itself needs no new fields for this.
2. **Onboarding** — `GettingStarted` + `FeatureTour` exist. Redesign's job:
   "installed → first audio generated" in the fewest steps, then a low-pressure
   map of the rest. Feed the 04 feature-exposure grouping in: onboarding shows
   the four jobs (Generate → Edit → Mix → Ship), not 60 features. First-run
   should route through the new design system's empty/loading states.
3. **Skills browser** — the conceptual gap: skills and models are both "things
   you install to extend the app," but skills are managed inside the assistant
   UI while models live in the Store. Plan: a skills browser/manager surface
   that reuses the catalog visual language from 07 (capability cards, owned /
   available states, enable/disable) over the existing `custom_skills.py` CRUD.
   No backend rebuild needed.
4. **Shortcuts** — surface `72-keyboard-shortcuts.md` in-app: add a "Shortcuts"
   entry to the command palette (already exists as a component) that opens the
   existing `/shortcuts` settings page or a palette searchable list. Content
   already documented; this is a navigation/UX change only.
5. **Help search parity** — the assistant/MCP help tool and the in-app search
   already share `search_features()`; keep that single scoring path when the UI
   restyle lands.

## 3. Sequencing

- 04 proof sign-off → restyle `HelpCenter` + `GettingStarted` with tokens/canonical components.
- 07 Store language lands → build the skills browser to match it.
- 08 inbox lands → onboarding nudges can use the notices channel (e.g. "try the pitch map") instead of new UI.

## 4. Verification status

Audit only; no UI changes in this pass (frontend is CI-gated in this
environment). Backend needs no changes.