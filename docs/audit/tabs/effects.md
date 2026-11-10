# Effects

Route: `/effects` → `app/src/features/effects/EffectsTab.tsx`. In nav: yes (Processing group).

## Job
A user comes here to build an effect chain (add/reorder/bypass), preview before/after, apply, and export.

## Complete-flow checklist
1. Input: audio from library/file. PARTIAL.
2. Configure: chain (add/reorder/bypass), presets, wet/dry. PRESENT (per TAB_AUDIT complete).
3. Model readiness: n/a (DSP).
4. Run: apply to selection. PRESENT.
5. Preview: fast preview, A/B. PRESENT.
6. Outputs: export. PARTIAL.
7. Save/history: saved chains? `services/effects.py`, `effects_chain.py`, `effects_extended.py`, `routes/effects.py`. PARTIAL.
8. Link out: to Edit/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: keyboard shortcuts? UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Effects chain | yes (`services/effects_chain.py`, `effects_extended.py`) | yes |
| Presets | yes (`services/presets.py`, `preset_preview.py`) | yes (`PresetDetail.tsx`) |
| Builtin effects (10+) | yes (`backends/effects.py`, `utils/effects.py`) | yes |

## Bugs/risks
- MINOR: effect param ranges must match backend (skills document real ranges). GUESS.

## Gaps & right UX
- Verify saved chains + send-to. PROPOSAL.
Confidence: TRACED (TAB_AUDIT complete), GUESS (details).