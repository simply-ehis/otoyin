# Prompt: Updater Logic — Audit & Harden

## Context

Unlike push notifications (08), an updater already exists — don't rebuild
it, audit and harden it:

- `app/src/hooks/useAutoUpdater.tsx` (frontend hook)
- `tauri/src/platform/updater.ts` (Tauri platform integration)
- `@tauri-apps/plugin-updater` is a listed dependency in `tauri/package.json`
  (the official Tauri updater plugin — good foundation, means you're not
  building update-download/signature-verification from scratch, Tauri
  handles that).
- Note from `docs/reports/XXX_TODO_AUDIT.md`: `useAutoUpdater.tsx` has 5
  intentional `eslint-disable` exemptions for exhaustive-deps (timer
  callbacks referencing stable state setters) — these are documented as
  intentional, not bugs, don't "fix" them without understanding why they're
  there first.

## Scope

1. **Confirm the update channel/manifest setup** in
   `tauri/src-tauri/tauri.conf.json` (updater config — endpoints, public key
   for signature verification) is production-ready: real HTTPS endpoint,
   real signing key (not a dev/test placeholder), correct versioning scheme.
2. **UX audit of `useAutoUpdater.tsx`:** does the user get a clear "update
   available → download → restart to apply" flow, or does it happen
   silently/confusingly? Given the rest of this redesign is about the app
   feeling professional, the update flow should feel deliberate — a real
   panel/notification (consistent with 08's notification inbox, not a
   competing floating pattern), not a jarring forced restart.
3. **Rollback / failure handling.** What happens if a downloaded update is
   corrupt or fails signature verification? Confirm the plugin's built-in
   handling is surfaced to the user rather than failing silently (another
   "flaky" candidate — same theme as 01 and 06: several perceived
   reliability issues in this app may trace back to *correct backend
   behavior with no UI surface for it*, not actual bugs).
4. **Coordinate with the rebrand (02)** — if `tauri.conf.json`'s bundle
   identifier or product name changes as part of the rebrand, confirm the
   updater's endpoint/manifest matching logic doesn't break for
   already-installed copies of the app under the old identifier. This is a
   real risk: existing users on old builds need a path to receive the
   rebrand update itself.

## Deliverable

A short audit note confirming production-readiness of the update channel,
plus any UX/error-handling gaps found, with fixes scoped separately (per
this pack's overall "audit first, implement second" approach) unless
trivial and safe.
