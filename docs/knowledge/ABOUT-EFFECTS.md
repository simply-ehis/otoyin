# About: Effects Tab

> **PURPOSE:** Reference for the Effects tab — effects chain preset management.
> **OWNS:** Effects list, effects detail, preset CRUD
> **READ-WHEN:** Working on effects, presets, effects chain
> **KEY-FILES:** `EffectsTab.tsx`, `EffectsList.tsx`, `EffectsDetail.tsx`
> **INVARIANTS:** Built-in presets cannot be deleted; custom presets can
> **GOTCHAS:** Save as Custom copies a built-in preset to a new custom one
> **UPDATED:** 2026-08-07

## Overview

Effects manages effects chain presets — collections of audio effects (compressor, EQ, reverb, etc.) that can be applied to generations.

## Effects List (Left Panel)

| Button | Action |
|---|---|
| + New Preset | Create new custom effects preset |
| Preset card | Select preset to view/edit |

## Effects Detail (Right Panel)

### For Custom Presets

| Button | Action |
|---|---|
| Delete | Delete custom preset |
| Save | Save changes |
| Preview | Preview effects on selected generation |

### For Built-in Presets

| Button | Action |
|---|---|
| Save as Custom | Copy built-in to new custom preset |
| Preview | Preview effects on selected generation |

### For New Presets

| Button | Action |
|---|---|
| Save Preset | Save the new preset |

## Available Effects (25+)

Effects include: compressor, EQ, reverb, delay, chorus, flanger, phaser, distortion, pitch shift, time stretch, noise reduction, and more. See `backend/audio/effects.py` for the full list.

## Agent Callable
- **MCP Tools:** `21labs.list_builtin_presets`, `21labs.export_preset`, `21labs.import_preset`, `21labs.list_community_presets`
- **REST Endpoints:** `GET /effects/available`, `GET /effects/presets`, `POST /effects/presets`, `PUT /effects/presets/{id}`, `DELETE /effects/presets/{id}`, `POST /effects/preview/{id}`, `POST /generations/{id}/versions/apply-effects`, `GET /presets/builtin`, `POST /presets/export`, `POST /presets/import`
- **Key Backend Files:** `backend/routes/effects.py`, `backend/services/effects.py`, `backend/services/presets.py`
- **Key Frontend Files:** `app/src/features/effects/EffectsTab.tsx`, `app/src/stores/effectsStore.ts`
