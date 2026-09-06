# Prompt: Marketplace Redesign (UI + Backend)

## Context

The marketplace already exists as a standalone service:
`marketplace/marketplace_server/` (FastAPI, deployed to Vercel + Neon per
`marketplace/README.md`), plus a web frontend at `marketplace/web/`
(Next.js-flavored — check `marketplace/web/package.json`) and an in-app
surface (`app/src/components/Store/StorePage.tsx`,
`StoreDetailModal.tsx`, `app/src/lib/marketplace.ts`). Catalog schema lives
at `docs/marketplace/catalog-schema-v1.json`. There's also a
`backend/routes/marketplace.py` that handles local licensing/entitlement
verification (fully offline, per its own docstring — "no network required"
for verification) separate from the remote marketplace service itself.

This prompt covers two things: (A) the hard auto-download rule + remote
catalog management backend, and (B) the visual/UX redesign of the
marketplace and catalog surfaces.

## Part A: Hard rule — only small bundled models auto-download

Per 06-model-lifecycle-optimization.md, the current bundled set is already
minimal (DeepFilterNet, Demucs, Silero VAD, LavaSR — confirmed in
`backend/scripts/download_required_models.py`). The rule you want formalized:
**every model outside that bundled set must be discovered and installed
through the marketplace flow — no other code path may silently trigger a
model download.**

1. Audit every call site that downloads model weights
   (`hf_hub_download`, any direct HTTP download in `backend/backends/*.py`,
   `backend/services/model_registry.py`) and confirm each one is only ever
   reached via a marketplace-gated install action, not triggered
   automatically by, e.g., a user merely selecting an engine in a dropdown.
2. If any backend currently does "download on first use" outside the
   marketplace/Models-tab flow (the `download_required_models.py` docstring
   mentions "Larger models... download on first launch via the Models tab" —
   confirm the Models tab itself routes through marketplace
   licensing/catalog checks, or whether it's a separate, ungated download
   path that happens to also exist), close that gap so the Models tab and
   the marketplace catalog are the same gated system, not two systems.
3. Free models should still be one click, no payment friction — "gated by
   the marketplace" means *cataloged and versioned centrally*, not
   necessarily *paid*. Check `Product.paid` (referenced in
   `marketplace/marketplace_server/routes/checkout.py`) — free products
   presumably have `paid=False` and skip checkout but still flow through
   the same catalog/install path.

## Part B: Backend — remote catalog/offer management

You want to add and update the models list, offers, and pricing remotely,
without bundling changes into app releases. Some of this infrastructure
already exists — don't rebuild it:

- `backend/services/marketplace_catalog.py` (`build_catalog`, `get_product`,
  `verify_catalog`) and `backend/services/marketplace_offers.py`
  (`get_active_offers`) already suggest a catalog that's fetched/verified
  rather than hardcoded — confirm whether it already pulls from the remote
  `marketplace/` service at runtime, or whether it's currently reading a
  catalog file that ships *inside* the app bundle (which would defeat the
  purpose — check this first, it's the crux of your ask).
- If the catalog is currently bundled: change it to fetch from the remote
  marketplace service on a schedule (e.g. on app start + periodic refresh),
  with the signed-catalog verification (`verify_catalog`) as the trust
  boundary — the docstring in `backend/routes/marketplace.py` mentions "P1
  (in-app marketplace surface + signed catalog)," so signing is already the
  intended trust model; make sure remote-fetch doesn't bypass that
  signature check.
- Build (or confirm exists) an admin-side interface for you to add/update
  models, prices, and time-limited offers in the remote service without a
  deploy — could be as simple as an authenticated route in
  `marketplace/marketplace_server/` plus a minimal admin page in
  `marketplace/web/`, doesn't need to be fancy, needs to be usable by you
  alone without redeploying the app.

## Part C: Visual redesign — marketplace + catalog

1. Apply the 04 design system. No cringe AI-marketplace-template look —
   study what makes a plugin/asset marketplace (think: a professional
   plugin store, not a generic SaaS pricing page) feel trustworthy and easy
   to browse: clear categories, consistent card sizing, real preview/demo
   affordances (audio samples for voice models are the obvious win here —
   confirm whether preview audio samples exist per-product already, add if
   not), clear "owned / not owned / cached locally / needs download"
   states per item.
2. Catalog/category arrangement: group by what the model *does*
   (TTS voice, voice conversion, music, SFX, spatial) before grouping by
   engine name — users care about capability first, engine name second.
3. In-app (`StorePage.tsx`/`StoreDetailModal.tsx`) and the web marketplace
   (`marketplace/web/`) should feel like the same product, not two different
   designs — share the design tokens from 04 across both, even though one's
   a Tauri-embedded view and the other's a public website.

## Deliverable

A plan (or implementation, per whatever stage this runs at) covering: the
gating audit from Part A with a list of any ungated download paths found,
a decision + implementation note on remote catalog fetching for Part B, and
redesigned marketplace screens (in-app + web) per Part C.
