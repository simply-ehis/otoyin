# 86 — Marketplace Utilities Shelf

PURPOSE: Why utilities live at the bottom and how pack categories collapse.
OWNS: app/src/features/store/storeUtils.ts, app/src/features/store/StorePage.tsx, app/src/features/store/ProductGrid.tsx
READ-WHEN: You add a category, change sort, or debug "utilities on top".
KEY-FILES: app/src/features/store/storeUtils.ts, app/src/features/store/ProductGrid.tsx, backend/services/marketplace_catalog.py
INVARIANTS: Bottom rank: core (0) < extras/sfx (1) < translation (2) < utilities (3); collapsed sections never hide installed states.
GOTCHAS: Catalog input order is not display order — groups are re-sorted by bottomRank on every render.
UPDATED: 2026-09-11

## Categories
`CATEGORIES` order: All, Voice, Transcription, Assistant, Voice Convert, Music & SFX, Translation, Extras, Utilities (Wrench icon). `CATEGORY_LABELS` + `CATEGORY_ACCENT` must gain any new id or cards fall back to extras styling.

## Sorting
`buildFilteredProducts` bottom-ranks utilities(3)/translation(2)/extras+sfx(1) after installed-first, before quality/price/name. `StorePage` groups re-sort by the same rank so utilities render last even when the catalog lists them first.

## Collapsed shelf
`ProductGrid` collapses `translation` + `utilities` behind "N packs — Show/Hide" headers (separate expanded state per section). All other categories render as open grids.

## Agent Callable
- **MCP Tools:** `21labs.models_list`
- **REST:** `GET /marketplace/catalog`, `GET /models/status`
- **Key Files:** `app/src/features/store/storeUtils.ts`, `backend/services/marketplace_catalog.py`
