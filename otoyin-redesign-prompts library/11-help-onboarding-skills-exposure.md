# Prompt: Help Sections, Onboarding, and Skills Exposure

## Context

Don't build this from zero — check what exists first:

- `backend/routes/help.py` — a help route already exists. Audit what it
  currently serves before designing a new system on top of it.
- `backend/routes/custom_skills.py` and `docs/knowledge/70-custom-skills.md`,
  `docs/knowledge/17-agent-skills.md` — skills infrastructure already
  exists at the backend level. The task here is largely about **surfacing**
  this well in the redesigned UI, not inventing the concept.
- `docs/knowledge/71-quick-start.md`, `72-keyboard-shortcuts.md` — existing
  quick-start and shortcuts documentation that should feed directly into
  onboarding rather than being rewritten separately.

## Scope

1. **Audit `help.py`'s current output** — is it structured content the
   frontend can render into a real in-app help section, or a stub? Build
   the in-app help UI (consistent with 04's design system) around whatever
   it already returns; extend the backend content model only if it's
   genuinely too thin.
2. **Onboarding flow.** First-run experience for a new user: given the
   feature surface is enormous (100+ knowledge-doc topics), onboarding's
   job isn't to explain everything — it's to get someone from "just
   installed" to "generated their first piece of audio" in the fewest
   steps, with a clear, low-pressure path to discover the rest later
   (this ties directly into the feature-exposure audit from 04 — onboarding
   is one of the surfaces that audit should feed into).
3. **Skills exposure.** `custom_skills.py` — figure out what a "skill" means
   in this app's model (read `70-custom-skills.md` and `17-agent-skills.md`
   first) and design a UI for browsing/enabling/creating them that fits
   the marketplace/catalog visual language from 07, since skills and models
   are conceptually similar "things you install to extend the app."
4. **Keyboard shortcuts.** Surface `72-keyboard-shortcuts.md`'s content in
   a real in-app reference (command palette or dedicated shortcuts panel),
   not just a doc file nobody opens.

## Deliverable

An in-app help section, a first-run onboarding sequence, and a skills
browser/manager UI — all consuming existing backend content where it
exists, extending it only where the audit shows a genuine gap.
