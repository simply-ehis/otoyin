# Spec: Conversation

## Goal
Build multi-speaker conversation audio with per-speaker voice selection.

## User story
User adds speakers → assigns voice to each speaker → writes lines → sets timing → generates → previews → exports.

## Layout
- Top: speakers list with voice picker
- Middle: lines table (speaker, text, start mode, offset, overlap)
- Bottom: generate/auto-duck/auto-level buttons + progress + player

## States
- Empty: add first speaker/line
- Loading: generating
- Done: mixed audio playable
- Error: toast + retry

## Controls/defaults
- Default engine kokoro; default profile first available
- Auto-duck toggle; auto-level toggle

## Backend calls
- `/conversation/generate`, `/conversation/auto-duck`, `/conversation/auto-level`, `/conversation/presets`

## Acceptance criteria
- Changing a speaker's voice changes all their lines' output.
- Generate uses per-line engine/profile_id.
- Resampling handled when engines differ (or restrict to same engine).