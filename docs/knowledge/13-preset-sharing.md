# 13 — Preset Sharing

## CommunityPresetsPage at `/community-presets`
- **Component:** `CommunityPresetsPage` in `app/src/features/content/CommunityPresetsPage.tsx`
- **What:** Browsable collection of shared effect presets with search, category filter, preset cards, and import.
- **Features:** Search by name/description, filter by category, preset cards showing author/tags/downloads/rating/featured badge, import via `importPresetFromCommunity()`.

## Preset Export
- **What:** Export an effects chain configuration as a portable JSON file.
- **Where:** `POST /presets/export`
- **Request:** `{ name, effects_chain, description, author, tags }`
- **Format:** `{ twentylabs_preset_version: "1.0", preset: { name, description, author, effects_chain, tags } }`

## Preset Import
- **What:** Import an effects chain from a `.dstf-preset` JSON file.
- **Where:** `POST /presets/import`
- **Validation:** Checks for valid JSON structure and effect types

## Built-in Presets
- **Voice Clean:** noise_gate → compressor → eq (dialogue cleanup)
- **Podcast Ready:** compressor → eq → gain (podcast broadcast)
- **Cinematic Voice:** reverb → compressor (cinematic dialogue)
- **Where:** `GET /presets/builtin`

## Agent Callable
- **MCP Tools:** `21labs.list_builtin_presets`, `21labs.export_preset`, `21labs.import_preset`, `21labs.list_community_presets`, `21labs.list_community_preset_categories`
- **REST Endpoints:** `GET /presets/builtin`, `POST /presets/export`, `POST /presets/import`, `GET /community-presets`, `GET /community-presets/categories`
- **Key Backend Files:** `backend/services/presets.py`, `backend/services/community_presets.py`, `backend/routes/features.py`, `backend/routes/phase2.py`
- **Key Frontend Files:** `app/src/features/content/CommunityPresetsPage.tsx`
