# 04 — Voice Effects Chain

## EffectsView at `/workspace/effects`
- **Component:** `EffectsView` in `app/src/components/Workspace/EffectsView.tsx`
- **What:** Drag-sortable effects chain with per-effect enable toggle, parameter sliders, preset save/load, add effect dropdown, and ABComparison wired at bottom.

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

## ABComparison
- **What:** Wired at bottom of EffectsView — toggle between original and processed audio for comparison
- **Component:** `ABComparison` in `app/src/components/ABComparison/ABComparison.tsx`
- **Modes:** Original (VolumeX icon), Processed (Volume2 icon), A/B (auto-switch after 2s)
- **UI:** Three toggle buttons, play/stop button, status description text

## Available Effects (Backend)
- Chorus/Flanger, Reverb, Delay, Compressor, Gain, High-Pass Filter, Low-Pass Filter, Pitch Shift
- **Where:** `backend/utils/effects.py` using Spotify Pedalboard
- **Chain format:** JSON array of `{ type, enabled, params }`
- **Preview:** `POST /effects/preview/{generation_id}` streams processed WAV

## Agent Callable
- **MCP Tools:** `21labs.list_builtin_presets`, `21labs.export_preset`, `21labs.import_preset`, `21labs.list_community_presets`, `21labs.list_community_preset_categories`
- **REST Endpoints:** `GET /effects/available`, `GET /effects/presets`, `GET /effects/presets/{id}`, `POST /effects/presets`, `PUT /effects/presets/{id}`, `DELETE /effects/presets/{id}`, `POST /effects/preview/{id}`, `POST /generations/{id}/versions/apply-effects`, `GET /presets/builtin`, `POST /presets/export`, `POST /presets/import`
- **Key Backend Files:** `backend/routes/effects.py`, `backend/services/effects.py`, `backend/services/presets.py`, `backend/routes/features.py`
- **Key Frontend Files:** `app/src/components/Workspace/EffectsView.tsx`, `app/src/components/EffectsTab/EffectsTab.tsx`, `app/src/stores/effectsStore.ts`
