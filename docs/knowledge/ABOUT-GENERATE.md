# About: Generate Tab

> **PURPOSE:** Reference for the Generate tab — the primary TTS/text-to-audio creation interface.
> **OWNS:** Generate tab, history panel, generation controls
> **READ-WHEN:** Working on generation UI, adding new TTS engines, fixing generation bugs
> **KEY-FILES:** `FloatingGenerateBox.tsx`, `GenerateBoxView.tsx`, `GenerateButton.tsx`, `ComposeButton.tsx`, `GenerationControlsRow.tsx`, `HistoryTable.tsx`, `HistoryRow.tsx`
> **INVARIANTS:** Generation requires a selected voice profile; engines are backend-driven
> **GOTCHAS:** Compose button only visible if profile has personality; InstructToggleButton only shown when expanded + engine supports instruct
> **UPDATED:** 2026-08-07

## Overview

The Generate tab is the primary interface for creating audio from text. It consists of a floating input box (left) and a history panel (right).

## Generate Box Controls

| Button | Icon | Action | Condition |
|---|---|---|---|
| **Generate** | Sparkles | Submits generation form | Requires profile selected, not pending |
| **Compose** | Dice | Auto-generates text using voice profile personality | Only if profile has personality |
| **Persona** | Wand2 | Toggles personality mode for generation | Only if profile has personality |
| **Instruct** | SlidersHorizontal | Toggles advanced instruct panel | Only when expanded + engine supports instruct |

## Dropdowns

| Dropdown | Purpose |
|---|---|
| Voice selector | Choose voice profile for generation |
| Language selector | Choose generation language |
| Emotion selector | Choose emotion DSP preset (Happy, Sad, Angry, Calm, Excited, etc.) |
| Engine/Model selector | Choose TTS engine and model |
| Effects preset selector | Choose effects chain preset |
| Temperature | Toggle auto (engine default) vs manual temperature |

## History Panel

### Per-Generation Actions

| Action | When Available |
|---|---|
| Play/Pause | Completed generation (click row) |
| Favorite (Star) | Completed generation |
| Toggle versions (AudioLines) | Generation with multiple takes |
| Retry (RotateCcw) | Failed generation |
| Delete (Trash2) | Failed generation |
| Cancel (Square) | In-progress generation |
| More actions menu | Completed generation |

### More Actions Menu

| Action | Description |
|---|---|
| Play | Play generation audio |
| Export Audio | Download as audio file |
| Export Package | Export generation + metadata |
| Apply Effects | Open effects dialog |
| Regenerate | Re-run TTS generation |
| Edit Audio | Open audio editor (AudioEditorPanel) |
| Copy Clip | Copy to process clipboard |
| Delete | Remove generation |

### Bulk Actions

| Action | Description |
|---|---|
| Clear failed | Remove all failed generations from history |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Enter | Submit generation (when text field focused) |
| Space | Play/pause selected generation |

## Language memory
The language dropdown defaults to English and remembers each explicit choice per engine (`uiStore.languageByEngine`, persisted). Precedence on profile/engine switch: remembered → profile default → English, always validated via `resolveEngineLanguage` against what the engine supports.

## Agent Callable
- **MCP Tools:** `21labs.speak`, `21labs.list_profiles`, `21labs.list_models`, `21labs.list_captures`
- **REST Endpoints:** `POST /generate`, `GET /history`, `GET /history/{id}`, `DELETE /history/{id}`, `POST /generate/{id}/retry`, `POST /generate/{id}/regenerate`, `GET /generate/{id}/status`, `POST /generate/stream`
- **Key Backend Files:** `backend/routes/generations.py`, `backend/routes/history.py`, `backend/services/generation.py`
- **Key Frontend Files:** `app/src/components/Generation/FloatingGenerateBox.tsx`, `app/src/components/Generation/GenerateBoxView.tsx`, `app/src/components/Generation/GenerateButton.tsx`, `app/src/components/History/HistoryTable.tsx`, `app/src/lib/hooks/useGeneration.ts`, `app/src/lib/hooks/useHistory.ts`
