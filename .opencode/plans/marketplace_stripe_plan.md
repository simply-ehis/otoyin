# Marketplace Implementation Plan (Stripe Only + exchangerate.dev)

## Overview
Since Stripe supports Nigeria and we're using exchangerate.dev free tier for currency conversion, we'll implement a Stripe-only marketplace with region-aware pricing via exchangerate.dev free tier.

## Overview
- ✅ Backend: Marketplace API on :8420 (49 products, 1 offer - LFM2 50% off)
- ✅ Frontend: StorePage with use-case chips, offer carousel, wishlist, region-aware pricing
- ✅ StoreDetailModal: expandable description, StarRating, reviews, wishlist
- ✅ StoreProductCard: wishlist heart button
- ✅ Vite proxy: `/api/v1/catalog/*` → `http://127.0.0.1:8420`
- ✅ Build passes (5.8s)
- ✅ Backend offers endpoint returns LFM2 50% off ($13 from $26)
- ✅ Qwen 3.8-27B UD-IQ2_S at $80 (no discount, baseline_usd: 80)
- ✅ LFM2 50% off ($13 from $26) - only offer currently
- ✅ Wishlist CRUD works
- ✅ Reviews work
- ✅ Build passes (5.8s)

---

## 📋 Implementation Plan

### Phase 1: Currency Conversion Service (exchangerate.dev) ✅
- [x] Add exchangerate.dev free tier integration (10,000 req/mo)
- [x] Fallback chain: exchangerate.dev → Frankfurter.dev → Frankfurter (self-hosted)
- [x] Cache rates for 4 hours
- [x] Auto-detect user region via IP geolocation

### Phase 2: Stripe-Only Integration ✅
- [x] Remove Flutterwave references from frontend
- [x] Stripe Checkout integration for all regions (including Nigeria)
- [x] Stripe supports Nigeria natively (cards, Apple Pay, Google Pay)
- [x] Webhook handlers for fulfillment

### Phase 3: Region-Aware Pricing ✅
- [x] Auto-detect user region via IP geolocation
- [x] Display prices in local currency using exchangerate.dev
- [x] Show savings when baseline_usd > price_usd
- [x] Offers carousel shows only real discounts (offer_discount_pct > 0)

### Phase 4: Clean Up & Test ✅
- [x] Remove Flutterwave references from frontend
- [x] Remove Flutterwave references from backend (routes, models)
- [x] Clean up old catalog.json (deleted)
- [x] Build passes (5.8s)
- [x] Backend API verified (offers, product detail, wishlist, reviews)

---

## 🔧 Remaining Tasks

### High Priority
- [ ] **Test live checkout flow** with Stripe test cards (Nigeria + US cards)
- [ ] **Verify webhook fulfillment** end-to-end (order → payment → license)
- [ ] **Test region detection** (US, EU, Nigeria, UK) and currency display
- [ ] **Test wishlist sync** (localStorage + server sync)
- [ ] **Test offer carousel** shows only LFM2 50% off

### Nice to Have (Phase 2)
- [ ] Region-specific pricing admin UI (admin panel for price overrides)
- [ ] Stripe Tax integration (automatic VAT/GST)
- [ ] Regional pricing admin dashboard
- [ ] A/B testing framework for pricing

---

## 🏗️ Architecture Summary

### Backend (marketplace_server)
```
marketplace_server/
├── models.py           # Product (baseline_usd, offer_discount_pct, use_cases, etc.)
├── routes/catalog.py   # /v1/catalog, /offers, /product/{id}, /wishlist, /reviews
├── seed.py             # 48 products including Qwen 3.8-27B ($80) + LFM2 50% off
└── routes/offers.py    # GET /offers (filters by offer_discount_pct > 0)
```

### Frontend (app/src/components/Store)
```
StorePage.tsx          # Main store with use-case chips, offer carousel, wishlist
StoreDetailModal.tsx   # Product detail with expandable desc, reviews, wishlist
StoreProductCard.tsx   # Product card with wishlist heart, Stripe checkout
StorePage.tsx          # Main store page with use-case chips, offer carousel
StoreProductCard.tsx   # Product card with wishlist heart, Stripe checkout
storeUtils.ts          # Filtering, sorting, use-case chips, capability chips
```

### API Endpoints (via Vite proxy /api → :8420)
```
GET  /v1/catalog              → 49 products
GET  /v1/catalog/offers       → 1 offer (LFM2 50% off)
GET  /v1/catalog/product/:id  → Product detail with baseline_usd, use_cases
GET  /v1/catalog/product/{id}/reviews
POST /v1/catalog/product/{id}/reviews
GET  /v1/catalog/wishlist?device_id=
POST /v1/catalog/wishlist/{id}
DELETE /v1/catalog/wishlist/{id}
```

---

## 🚀 Ready for Live Testing

**Current servers running:**
- Backend: `python -m uvicorn marketplace_server.app:app --port 8420` → `http://127.0.0.1:8420`
- Frontend: `bun run dev` on port 21133 (proxy to :8420)

**Verified Endpoints:**
| Endpoint | Status |
|----------|--------|
| `GET /v1/catalog` | 49 products |
| `GET /v1/catalog/offers` | 1 offer (LFM2 50% off) |
| `GET /product/qwen3-8-27b-ud-iq2-s` | ✅ baseline_usd: 80 |
| `GET /product/kokoro-onnx` | ✅ use_cases: 4, long_desc: 274 chars |
| `GET /offers` | 1 offer (LFM2 50% off: $13 from $26) |
| `GET/POST/DELETE /wishlist` | ✅ CRUD works |
| `GET/POST /reviews` | ✅ works |

---

## 🚀 Next Steps

### Immediate (This Session)
1. **Test live checkout flow** with Stripe test cards (Nigeria + US)
2. **Verify webhook fulfillment** end-to-end (order → payment → license)
2. **Test region detection** (US, EU, Nigeria, UK) and currency display
4. **Test wishlist sync** (localStorage + server sync)
5. **Test offer carousel** and LFM2 50% off display

### After Testing
- [ ] Commit all changes
- [ ] Tag release
- [ ] Document API for web marketplace

---

## 💰 Cost Summary (Current Setup)

| Service | Cost | Notes |
|---------|------|-------|
| Stripe | Pay-as-you-go | 2.9% + $0.30 (US), 3.9% + $0.30 (intl) + 1.5% cross-border |
| exchangerate.dev | **Free** | 10,000 req/mo free tier |
| Backend hosting | ~$5-10/mo | Railway/Render hobby tier |
| Frontend hosting | Free | Vercel/Netlify free tier |
| **Total** | **~$5-10/mo** | Very cost-effective |

---

## 🎯 Next Steps

**Ready for live testing!** What would you like to test first?

1. **Full checkout flow** with Stripe test card (Nigeria)
2. **Region detection** and currency switching
3. **Wishlist + reviews** flow
4. **Offer carousel** and LFM2 50% off display
5. **Webhook fulfillment** end-to-end

Say "test checkout", "test regions", "test wishlist", or "test all" to begin.