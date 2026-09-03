# About: Voices Tab

> **PURPOSE:** Reference for the Voices tab — voice profile creation and management.
> **OWNS:** Voice list, voice inspector, profile form
> **READ-WHEN:** Working on voice profiles, voice cloning, avatar upload
> **KEY-FILES:** `VoicesTab.tsx`, `VoiceInspector.tsx`, `ProfileFormActions.tsx`
> **INVARIANTS:** Profiles have name, description, language, effects chain, optional avatar
> **GOTCHAS:** Avatar upload is hover-overlay on avatar; remove is X icon bottom-right
> **UPDATED:** 2026-08-07

## Overview

Voices manages voice profiles — reusable configurations with name, description, language, effects chain, and optional avatar image.

## Header

| Button | Action |
|---|---|
| + New Voice | Open Create Voice Profile dialog |
| Search input | Filter voices by name/description/language |

## Voice Table

| Interaction | Action |
|---|---|
| Row click | Select voice for inspection |
| Channel MultiSelect | Assign/unassign voice to channels |

## Voice Inspector (Right Panel)

| Button | Action |
|---|---|
| Change avatar (Edit2 icon) | Upload new avatar image |
| Remove avatar (X icon) | Remove current avatar |
| Save Changes | Save profile name, description, language, effects chain |

## Profile Form (Create/Edit Dialog)

| Button | Action |
|---|---|
| Cancel | Close dialog |
| Submit | Create new profile or save changes |

## Agent Callable
- **MCP Tools:** `21labs.list_profiles`, `21labs.speak`, `21labs.list_captures`
- **REST Endpoints:** `POST /profiles`, `GET /profiles`, `GET /profiles/{id}`, `PUT /profiles/{id}`, `DELETE /profiles/{id}`, `POST /profiles/{id}/samples`, `GET /profiles/{id}/samples`, `POST /profiles/import`, `GET /profiles/{id}/export`, `GET /profiles/presets/{engine}`
- **Key Backend Files:** `backend/routes/profiles.py`, `backend/services/profiles.py`
- **Key Frontend Files:** `app/src/components/VoicesTab/VoicesTab.tsx`, `app/src/components/VoicesTab/VoiceInspector.tsx`, `app/src/components/VoiceProfiles/ProfileForm.tsx`, `app/src/components/VoiceProfiles/QuickCloneDialog.tsx`
