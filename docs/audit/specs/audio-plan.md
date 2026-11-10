# Spec: Audio Plan

## Goal
Generate scene-based audio plan with per-track voice/engine and render.

## User story
User pastes script → app splits scenes → user assigns voice per scene → generate → preview → export.

## Layout
- Left: scene list (text)
- Right: per-scene track rows (dialogue/SFX/music) with voice picker + engine picker + generate button
- Bottom: render progress + export

## States
- Empty: paste script prompt
- Loading: analyzing
- Running: generating per track
- Done: tracks playable
- Error: per-track error + retry

## Controls/defaults
- Default engine: kokoro; default voice: first profile
- Auto-assign voice per unique speaker (LLM assist optional)

## Backend calls
- `POST /audio-plan/*` (existing), `PlanTrackUpdate` with voice_profile_id/engine.

## Acceptance criteria
- Per-track voice picker changes rendered voice.
- Model not installed shows install button.
- Cancel stops render and frees memory.