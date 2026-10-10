---
name: marketplace-utilities
description: Browse the marketplace utilities shelf (bottom-collapsed packs). Use when a user wants "translation packs", "vocal isolation", "utilities", or reports utilities mixed with voices.
---
# Marketplace Utilities

## Purpose
Keep core voices on top and pack-type tools (utilities/translation/extras) collapsed at the bottom.

## When to use
- "Where are translation packs / Demucs / utilities?"
- Utilities appear above voices
- Adding a new category

## Agent procedure

### 1. Open the Store
```
UI: /store → scroll past Voice/Transcription/Assistant/Music to Utilities (collapsed "N packs")
REST: GET /marketplace/catalog + GET /models/status
```

### 2. Expand + install
Expand Utilities (or Translation), Download/Install, then Verify via `GET /models/verify/{id}`.

### 3. Dev rule
Bottom rank: core(0) < extras/sfx(1) < translation(2) < utilities(3). New pack categories go in `CATEGORIES` last + `CATEGORY_LABELS` + `CATEGORY_ACCENT` + bottomRank in `app/src/features/store/storeUtils.ts` and `app/src/features/store/StorePage.tsx`.

## Pitfalls / Gotchas
- Catalog order ≠ display order; groups re-sort every render.
- Collapsed sections still show Installed badges — never hide them.

## Cross-links
- [model-manager](../model-manager/SKILL.md) — install/verify the pack

## Validation
- Utilities render last, collapsed, with correct counts; voices stay on top.
