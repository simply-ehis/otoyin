# Store (Marketplace)

Route: `/store` → `app/src/features/store/StorePage.tsx`. In nav: yes (Store group). `/models` redirects here.

## Job
A user comes here to browse/search/filter models and voice packs, view size/hardware/license, install/uninstall with progress, updates, installed state shown everywhere.

## Complete-flow checklist
1. Input: search/filter. PRESENT.
2. Configure: filters (size/hardware/license). PARTIAL.
3. Model readiness: installed state. PRESENT.
4. Run: install/uninstall with progress. PRESENT (marketplace service).
5. Preview: n/a.
6. Outputs: n/a.
7. Save/history: installed models. PRESENT.
8. Link out: to tabs needing model. PARTIAL.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Marketplace | yes (`services/marketplace_catalog.py`, `routes/marketplace.py`, `model_files.py`, `model_integrity.py`) | yes (StorePage) |
| Install/uninstall | yes | yes |

## Bugs/risks
- MINOR: paid items/checkout? UNVERIFIED (Paddle integration exists). GUESS.

## Gaps & right UX
- Ensure installed state reflected in all tabs' model pickers. PROPOSAL.
Confidence: TRACED (feature-exposure).