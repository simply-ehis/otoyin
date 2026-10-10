# 07 — AI Audio Plan System

## AudioPlanView at `/workspace/audio-plan`
- **Component:** `AudioPlanView` in `app/src/features/workspace/AudioPlanView.tsx`
- **What:** Scene-based audio planning with Auto/Guided mode toggle, scene list, generate button, and timeline grid overlay.

## Auto/Guided Mode Toggle
- **Auto mode** (`Sparkles` icon): AI-analyzed planning — add scenes with names and durations, generate audio plan automatically
- **Guided mode** (`Brain` icon): Manual wizard — add tracks per project with type selection (dialogue, music, sfx, ambient)

## Scene List (Auto Mode)
- **What:** List of scenes with name and duration
- **Controls:** Add scene (`+` button), remove scene (trash icon per scene)
- **Default scenes:** "Scene 1: Introduction" (30s), "Scene 2: Dialogue" (45s)
- **New scenes:** Auto-named "Scene N" with 30s default duration

## Generate Button
- **What:** "Generate Plan" button (Sparkles icon)
- **Behavior:** Sets `generated` flag, shows generated plan grid overlay
- **Generated view:** Scene cards with track grid per scene showing dialogue/music/sfx/ambient tracks

## Track Assignment (Guided Mode)
- **What:** Per-project track list with type selection dropdown
- **Track types:** dialogue, music, sfx, ambient
- **Controls:** Add track, remove track

## Backend API
- `POST /audio-plan/auto` — Generate plan from scene data
- `POST /audio-plan/validate` — Validate plan for errors
- `POST /audio-plan/stats` — Get plan statistics
- **Where:** `backend/services/audio_plan.py`

## Agent Callable
- **MCP Tools:** (none — audio plan is UI-initiated)
- **REST Endpoints:** `POST /audio-plan/auto`, `POST /audio-plan/validate`, `GET /audio-plan/stats`
- **Key Backend Files:** `backend/services/audio_plan.py`, `backend/routes/audio_plan.py`
- **Key Frontend Files:** `app/src/features/workspace/AudioPlanView.tsx`
