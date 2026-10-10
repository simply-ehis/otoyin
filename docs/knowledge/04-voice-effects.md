# 04 — Voice Effects Chain

## EffectsView at `/workspace/effects`
- **Component:** `EffectsTab` in `app/src/features/effects/EffectsTab.tsx`
- **What:** Drag-sortable effects chain with per-effect enable toggle, parameter sliders, preset save/load, add effect dropdown.

## Drag-Sortable Chain
- **Library:** `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop reordering
- **Each effect row:** Grip handle (drag icon), effect name, enable toggle (Power icon), expand/collapse (Chevron), delete (Trash2)
- **Sensors:** Pointer sensor with 5px activation distance, keyboard sensor with sortable keyboard coordinates
- **Strategy:** Vertical list sorting

## Enable Toggle
- **What:** Per-effect power button to enable/disable without removing
- **UI:** Power icon button — accent color when enabled, muted when disabled
- **State:** Stored in `{ type, enabled, params }` effect config

## Parameter Sliders
- **What:** Numeric sliders for each effect's configurable parameters
- **Data source:** `GET /effects/available` returns parameter definitions (min, max, default, step)
- **Display:** Collapsed effect shows name only; expanded shows all parameter sliders with labels and values

## Preset Save/Load
- **Load:** Select dropdown at top loads from `GET /effects/presets`
- **Save:** "Save Preset" button saves current chain
- **Built-in presets:** Voice Clean, Podcast Ready, Cinematic Voice

## Add Effect Dropdown
- **What:** Select dropdown to append a new effect to the end of the chain
- **Data source:** `GET /effects/available` lists all effect types
- **Behavior:** Adds effect with default parameters, auto-expands it

## ABComparison (removed)
- Formerly wired at the bottom of the Workspace EffectsView; the standalone `ABComparison` component was removed with that view. Audition processed audio via history playback (`app/src/features/generate/HistoryList.tsx`) or capture playback (`app/src/features/captures/InlinePlayer.tsx`).

## Available Effects (Backend)
- Chorus/Flanger, Reverb, Delay, Compressor, Gain, High-Pass Filter, Low-Pass Filter, Pitch Shift
- **Where:** `backend/utils/effects.py` using Spotify Pedalboard
- **Chain format:** JSON array of `{ type, enabled, params }`
- **Preview:** `POST /effects/preview/{generation_id}` streams processed WAV

## Agent Callable
- **MCP Tools:** `21labs.list_builtin_presets`, `21labs.export_preset`, `21labs.import_preset`, `21labs.list_community_presets`, `21labs.list_community_preset_categories`
- **REST Endpoints:** `GET /effects/available`, `GET /effects/presets`, `GET /effects/presets/{id}`, `POST /effects/presets`, `PUT /effects/presets/{id}`, `DELETE /effects/presets/{id}`, `POST /effects/preview/{id}`, `POST /generations/{id}/versions/apply-effects`, `GET /presets/builtin`, `POST /presets/export`, `POST /presets/import`
- **Key Backend Files:** `backend/routes/effects.py`, `backend/services/effects.py`, `backend/services/presets.py`, `backend/routes/features.py`
- **Key Frontend Files:** `app/src/features/effects/EffectsTab.tsx`, `app/src/stores/effectsStore.ts`
