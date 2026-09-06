# Prompt: Testing Strategy for the Rebuild

## Why this needs its own prompt

Confirmed in the audit: the old frontend had **18 test files for 275
components** — thin coverage before anything was touched. Now that the
components are deleted for the forced rebuild (03), whatever those 18 tests
covered is almost certainly orphaned — testing imports that no longer
exist. Left unaddressed, the rebuild could easily ship with **zero frontend
test coverage**, which is exactly the kind of gap that produces the "looks
done, isn't actually solid" outcome you're trying to avoid with the
no-half-edits rule in 03.

The backend, for contrast, has 130 test files and is in good shape —
this prompt is about the frontend and about keeping the backend's
discipline intact as its API surface changes underneath it (rebrand,
payment migration, remote catalog fetching).

## Rule: tests are part of "done," not a follow-up task

Add this to 03's Definition of Done, explicitly: **a component isn't
finished until it has a test alongside it**, written in the same work
session, not deferred to a "testing pass" at the end. Agents deprioritizing
tests under time pressure is a common and predictable failure mode — name
it and rule it out up front rather than discovering it after the rebuild
is "done."

## Scope

1. **Component-level tests**, written per the canonical component library
   from 04 first (these get reused everywhere, so they're the highest-
   leverage place to get right): render tests, interaction tests (click,
   keyboard nav, focus states), and state-variant tests (loading/error/empty
   for anything that has them).
2. **Critical-path integration/e2e tests** for the handful of flows that
   actually matter if broken: generate → play → export audio; open a
   project → edit on the waveform → save; browse marketplace → buy/install
   a model → it appears ready to use. Check what e2e tooling already exists
   (`docs/DEPLOYMENT_TEST_PLAN.md` and any Playwright/Cypress config) before
   standing up new tooling.
3. **Backend regression coverage for anything touched by this redesign** —
   the rebrand (02), payment migration (10), and marketplace remote-catalog
   changes (07) all touch code with existing test coverage. Each of those
   prompts should leave existing backend tests passing, or updated
   deliberately, not silently broken. Add this as an explicit acceptance
   check to 02/07/10 if it isn't already implied.
4. **A coverage floor, not a coverage target.** Don't chase a percentage
   number — set a floor (e.g. "every canonical component has at least a
   render test and one interaction test") that's realistic to actually
   enforce, and check it via CI (`.github/workflows/ci.yml`) so it can't
   silently regress once the rebuild is "done."

## Deliverable

A CI check that fails a PR touching `app/src` if a new/changed component
has no corresponding test file, a small set of e2e tests covering the
critical paths above, and confirmation that existing backend test suites
still pass after the rebrand/payment/marketplace changes land.
