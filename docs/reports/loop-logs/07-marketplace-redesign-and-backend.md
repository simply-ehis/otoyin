# Loop log — 07-marketplace-redesign-and-backend

## 2026-09-05 — PLAN
Re-read Context: standalone service + in-app surface + catalog schema + local licensing.
Part A (gating), B (remote catalog + admin), C (visual redesign).

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Part A gating audit | Bundled set minimal per download_required_models docstring (DeepFilter/Demucs/VAD/LavaSR). Download route `backend/routes/models/download.py` resolves entitlements via licensing (`entitlement_for_product`, paid-gate). Exhaustive call-site trace (hf_hub_download + direct HTTP in backends/*.py vs marketplace gate) NOT yet run | IN PROGRESS (mechanism exists; exhaustive trace pending) |
| Part B remote fetch | IMPLEMENTED: `OTOYIN_CATALOG_URL` + `refresh_remote_catalog()` + staleness/poll intervals in env; signature check via licensing (`verify_license_signature` lineage); `marketplace.ts fetchCatalog()` hits `/v1/catalog` remote; catalog routes (catalog.py) + download license gate present | PASS (code) — "prove with remote-change test" still open |
| Part B admin interface | Routes exist (catalog.py, notices.py, crashes.py, checkout.py, webhook.py). "Ehis personally adds/updates a model without a deploy" walkthrough NOT logged | IN PROGRESS (needs the live once-through) |
| Part C visual parity | In-app `features/store/` rebuilt (StoreProductCard, StoreDetailModal + tests); web `marketplace/web/src` (ProductCard, CategoryGrid, FeaturedOffers/Products, HeroSection). Side-by-side token-parity review NOT logged | IN PROGRESS |

## AUDIT checkpoint
No Part B/C change opened a new ungated path in this pass (verify-only; download.py gate intact). PASS.

## Exit checklist
- [ ] Zero ungated download paths (pending exhaustive trace)
- [ ] Catalog updates provably need no rebuild (code yes, live proof no)
- [ ] Same design language both surfaces (pending side-by-side)
→ FILE IN PROGRESS.
