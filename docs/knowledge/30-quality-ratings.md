# 30 — Quality Ratings

PURPOSE: 10-star quality scoring per model in the marketplace, categorized by domain (TTS, STT, LLM, Music, SFX).
OWNS: Quality score display, per-category ranking, StarRating component, marketplace catalog quality_score.
READ-WHEN: You touch model listings, marketplace cards, or model detail views.
KEY-FILES: app/src/components/Store/StarRating.tsx, app/src/components/Store/StoreProductCard.tsx, app/src/components/Store/StoreDetailModal.tsx, backend/services/marketplace_catalog.py
INVARIANTS: Scores are 1–10 per category; gold ≥8, amber ≥6, neutral <6; similar products section uses category + quality for ranking.
GOTCHAS: quality_score is optional on MarketplaceProduct — some legacy entries may not have it.
UPDATED: 2026-08-21

## Agent Callable

| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| List models with scores | `21labs.list_models` | `GET /models/status` | `backend/routes/models/status.py` |
| Marketplace catalog | — | `GET /marketplace/catalog` | `backend/services/marketplace_catalog.py` |

## How It Works

### Scoring System
Each model gets a quality score (1–10) within its category:

| Score Range | Badge | Meaning |
|-------------|-------|---------|
| 9–10 | ★★★★★ Gold | Industry-leading, best available |
| 7–8 | ★★★★ Silver | Excellent, production-ready |
| 5–6 | ★★★ Bronze | Good, suitable for most use cases |
| 3–4 | ★★ Basic | Acceptable, has limitations |
| 1–2 | ★ Minimal | Experimental or very limited |

### Categories
Scores are per-category, not global:

| Category | Examples |
|----------|----------|
| TTS | Kokoro, KittenTTS, F5-TTS, StyleTTS2 |
| STT | Whisper, Parakeet, Qwen3-ASR |
| LLM | Qwen3.5, Cactus Needle |
| Music | Stable Audio, AudioCraft |
| SFX | Freesound, AudioCraft SFX |
| Voice Clone | Fish Speech, Seed-VC, RVC |

### Display Components

| Component | File | Usage |
|-----------|------|-------|
| `StarRating` | `app/src/components/ui/star-rating.tsx` | Full star display (xs/sm/md) |
| `CompactRating` | `app/src/components/ui/star-rating.tsx` | Compact badge (number + stars) |
| `StoreProductCard` | `app/src/components/Store/StoreProductCard.tsx` | Card with stars |
| `StoreDetailModal` | `app/src/components/Store/StoreDetailModal.tsx` | Detail modal with stars + similar products |
| `ModelList` | `app/src/components/ServerSettings/ModelList.tsx` | Settings model list with compact rating |
| `ModelDetailDialog` | `app/src/components/ServerSettings/ModelDetailDialog.tsx` | Detail dialog with full rating |

### Similar Products
Store detail modal shows top 3 same-category products ranked by quality_score:
```typescript
const similar = catalog
  .filter(p => p.category === product.category && p.id !== product.id)
  .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
  .slice(0, 3);
```

### Backend Catalog
Quality scores are defined in `backend/services/marketplace_catalog.py`:
```python
{
    "id": "kokoro-82m",
    "name": "Kokoro-82M",
    "category": "tts",
    "quality_score": 9,  # Gold tier
    ...
}
```
