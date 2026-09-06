# Marketplace — Gating Audit, Remote Catalog Decision & Redesign Plan

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/07-marketplace-redesign-and-backend.md`
**Stage:** plan + decision note; **backend + Store UI now implemented (2026-09-06):**
`local_status` annotation on catalog endpoints, signed remote-catalog fetch with
bundled fallback, staleness-gated + 24h periodic refresh + Store-open nudge +
manual check button, per-product owned/cached/needs-download states, dismissible
failure hint. Remaining: payments-side/admin e2e per Part C.

---

## Part A — Hard auto-download rule: audit result

**Rule to enforce:** every model outside the bundled set (DeepFilterNet, Demucs,
Silero VAD, LavaSR) must be discovered + installed through the marketplace
flow. No other code path may silently trigger a download.

| Check | Finding |
|---|---|
| Download routes gated? | ✅ `backend/routes/models/download.py` is the only in-app download entry; it enforces `entitlement_for_product` / `has_entitlement` / `get_product` (marketplace licensing) before any `hf_hub_download`. |
| Load path gated? | ✅ `backend/backends/registry.py:218` blocks `load_engine_model` for non-downloaded models (`MODEL_NOT_DOWNLOADED_MSG`). So a backend's `hf_hub_download` call sites (kitten `_kitten_tts_onnx.py:103`, pocket `_pocket_tts_onnx.py:270`, bark `bark_backend.py:136,152`, f5 `f5_tts_onnx_backend.py:52`, faster-whisper `faster_whisper_backend.py:88`, fish S2 `fish_speech_s2_backend.py:104`) are reachable only after the gated download happened — mostly `force_offline_if_cached=True`, so they never hit the network for uncached models. |
| Models tab vs marketplace one system? | ✅ Same system — the Models tab routes through the same `models/download.py` (entitlement + `get_product`). Free models skip checkout (`paid=False`) but still flow through the catalog/install path. |
| On-demand pip installs | ✅ `_ENGINE_PIP_DEPS` (kokoro, faster-whisper) run inside the same gated download route; no-op when frozen. |
| **⚠ Needs human verification** | `backend/utils/stt_self_check.py` loads STT backends once at boot ("instantiate → check cached → load → verify → unload"). It's best-effort/cached-only by design, but it is the one startup path that instantiates a backend outside the Models-tab flow. Confirm its "check cached" step never triggers a network fetch for a missing model (current code skips when not cached). |

**Verdict:** no silently-triggered download path found; the architecture already
satisfies the hard rule. The 06 `local_status` UI annotation (see
`docs/reports/2026-09-03-model-lifecycle-report.md` §3) closes the *UI-side*
gap: a non-cached selection must route to the Store/Models install flow instead
of a hard error.

## Part B — Remote catalog / offer management

**Current state (verified):** the in-app catalog is **bundled**, not fetched.
`backend/services/marketplace_catalog.py` hardcodes `PRODUCTS`, signs the
catalog at request time with the local licensing key, and serves it from
`GET /marketplace/catalog` (+ `/local`). The remote
`marketplace/marketplace_server` (Vercel + Neon) **does** serve a DB-backed
catalog (`routes/catalog.py`: `GET /v1/catalog`, `/offers`, `/product/{id}`,
reviews, wishlist) — but the app never calls it. So updating models/prices/
offers today requires an app release. That defeats the ask.

**Decision: fetch the signed catalog from the remote service on a schedule,
with signature verification as the trust boundary, falling back to the bundled
catalog offline.**

Implementation note (phases):

1. **Remote signs a full catalog document** — the marketplace service builds a
   catalog JSON (schema v1, extended with `download.repo_id/filename/size`,
   `preview_audio_url`) and signs it with the marketplace Ed25519 private key.
   The app embeds the corresponding **public key** (already the intended trust
   model per `backend/routes/marketplace.py` docstring "P1 (in-app marketplace
   surface + signed catalog)").
2. **Local fetch + verify** — new service (extend `marketplace_catalog.py`):
   on app start + a periodic refresh (24h) + on Store open, fetch
   `GET /v1/catalog`, verify signature with the embedded public key, and swap
   the in-memory `PRODUCTS`. On failure (offline, tamper) keep the bundled
   catalog and log silently — offline-first, no error state for a catalog check.
3. **Schema/data gaps to close first** (both in bundled `PRODUCTS` and the
   remote seed):
   - `download.{repo_id,filename,size_bytes}` exists in the schema but no
     product populates it — the app can't install from catalog data alone today.
   - `preview_audio_url` exists in the schema but no product populates it —
     previews (Part C) have nothing to play.
   - Product `id` ↔ backend `model_name` mapping must stay exact (download
     pipeline resolves entitlements via this name).
4. **Admin interface (no redeploy)** — `marketplace_server` has read routes but
   no authenticated create/update/delete for products or offers. Add a small
   admin surface: authenticated `POST/PUT /v1/admin/products`,
   `POST /v1/admin/offers` (time-limited, `special_offer` flag) + a minimal
   admin page in `marketplace/web` (this also unblocks 10-payments once a
   provider is chosen). Admin writes must trigger a re-sign of the catalog.

The 06 report's `local_status` annotation composes with this: the UI renders
per-product `owned / cached / needs download` from entitlements + downloads +
the (possibly remote) catalog.

**Implementation status (updated):** phases 1–2 are **implemented and tested**.

- **Phase 1 (remote signing)** — `marketplace/marketplace_server/routes/catalog.py`
  now signs the **full response payload** (`schema_version`, `currency`, `products`,
  `signed_at`) with the marketplace Ed25519 key — matching the client's
  `verify_license_signature` canonical form (all keys except `sig`, sorted,
  compact) — so fetched catalogs verify locally.
- **Phase 2 (local fetch + verify + fallback)** —
  `backend/services/marketplace_catalog.py` gains `refresh_remote_catalog()`:
  fetch `GET /v1/catalog` (via `OTOYIN_MARKETPLACE_URL`), verify the signature
  with the embedded public key, swap the in-memory `PRODUCTS`; on any failure
  (network, bad signature, timeout) it keeps the bundled catalog and logs
  silently — offline-first. Wired into `backend/app.py` startup as a
  background task (no blocking). Covered by `backend/tests/test_remote_catalog.py`
  (6 hermetic tests: shaped-catalog verify, success swap, network-failure
  fallback, bad-signature rejection, disabled-when-unset, staleness check).

  Remaining (phases 3–4): populate `download.{repo_id,filename,size_bytes}` and
  `preview_audio_url` on products, and the authenticated admin create/update
  surface on the marketplace service.

## Part C — Visual redesign (marketplace + catalog)

Consumes `docs/design/DESIGN_SYSTEM.md` (tokens + canonical components) on
both surfaces so the in-app Store (`StorePage.tsx` / `StoreDetailModal.tsx`)
and the public `marketplace/web` feel like one product:

- **Capability-first categories** (per the pack): TTS voices → Voice conversion
  → Music → SFX → Spatial → Assistant planners. Engine name secondary.
- **Per-item state row** (from 06): owned (badge + activate) / cached locally
  (one-step activate) / needs download (Store install flow) / not owned (price
  + buy). No silent downloads.
- **Preview audio** — populate `preview_audio_url` (Part B) and render an
  inline waveform/play control on cards; this is the single highest-trust
  affordance for a voice marketplace.
- **Card grid** — consistent card sizing (grid skill), owned/paid visual
  distinction without a second "soup" layer, real hover/press feedback,
  truncation rules for long model names, empty state for "no results".
- **Detail modal** — capped width (modal skill), preview + license note +
  system requirements + reviews (routes exist) + the single primary action
  (Buy / Activate / Download).
- **Offers** — one banner slot at the top of the Store (persistent until
  expiry, banner rules), not interleaved cards.

## Deliverables status

Plan complete. Part B phases 1-2 (**remote signed catalog fetch + verify +
offline fallback**) are **implemented and tested** (see status note in Part B);
the runtime path is also live: a startup background task polls hourly
(`OTOYIN_CATALOG_POLL_S`) and refreshes only when the last successful fetch is
stale (`remote_catalog_stale`, threshold `OTOYIN_CATALOG_REFRESH_S`, default
24h), so signed catalog updates propagate without an app restart and failed
fetches retry on the next tick. The Store also nudges a stale-gated refresh on
every open (`POST /marketplace/catalog/refresh` → refetch when products
changed), so newly published models appear on the next Store visit. 06
`local_status` is implemented and tested.

Part C's **per-item state row is now implemented** on the in-app Store
(`StoreProductCard` + `StoreDetailModal`): products render **owned** (solid
`info-soft` chip + one-step Install when not on this device) / **cached**
(success chip, ready + delete/manage) / **needs download** (price or Free chip
→ Download/Buy), derived from entitlements + `local_status` (falling back to
the live model-status signal). State chips use the solid `*-soft` status tokens
from the 04 design system (`docs/design/DESIGN_SYSTEM.md`). Remaining: Part B
phases 3-4 (product `download.*`/`preview_audio_url` data + admin surface) and
the rest of Part C (preview audio, capability-first taxonomy, offers slot) —
still gated on the 04 proof sign-off.