---
name: audio-plan
description: Generate a scene-based AI audio plan (dialogue/SFX/music track assignment) from a script; use when an agent must "plan the audio for a scene/script", "assign voices and music per scene", or build a production blueprint.
---
# AI Audio Plan

## Purpose
`backend/services/audio_plan.py` turns scene + character data into a structured
production plan: per-scene tracks for dialogue, SFX, and music, with start/end times
and character/voice assignments. `generate_auto_plan` is the Auto mode engine; this
drives downstream generation (TTS per line, SFX, music beds). Non-destructive planning
only — it produces a JSON plan, never audio.

## When to use
- "Plan the audio for this script / these scenes".
- Assign dialogue lines to characters/voices and lay out SFX + music cues.
- Produce a blueprint before calling `speak` / `generate_sfx` / `arrange_music`.

## Prerequisites
- Tool surface: REST only — `POST /audio-plan/auto`, `POST /audio-plan/validate`,
  `GET /audio-plan/stats`. (No MCP tool; drive via REST.)
- Inputs: scene list (id, name, duration, dialogue lines) + character list.

## Parameters / Schema (REAL from `AutoPlanRequest` / `generate_auto_plan`)
| field | type | default | notes |
|-------|------|---------|-------|
| scenes[].id | str | — | scene id |
| scenes[].name | str | — | display name |
| scenes[].duration | float (s) | — | scene length |
| scenes[].dialogue[] | list | [] | {character, text, emotion} |
| characters[] | list[dict] | [] | voice profile hints |
| fps | float | 24.0 | timeline fps for ms math |

### Track assignment logic (`generate_auto_plan`)
- **Dialogue**: one track per line. `estimated_duration = max(2.0, len(text)*0.08)` s;
  sequential, `start_time_ms = offset*1000`, `end_time_ms = (offset+dur)*1000`, then
  `offset += dur + 0.5` (0.5 s gap). `track_type="dialogue"`.
- **SFX**: one `Ambient SFX` track per scene, 0 → `duration*1000` ms, note "room tone/ambience".
- **Music**: one `Underscore` track per scene, 0 → `duration*1000` ms, note "mood-based".
- Track types in code: `dialogue`, `sfx`, `music` (doc also lists `ambient`).

## Agent procedure
1. Collect scenes + dialogue lines + characters from the script.
2. `POST /audio-plan/auto` with `{scenes, characters, fps}` → `{plan_json}`.
3. Validate: `POST /audio-plan/validate` `{plan_json}` → `{valid, warnings, ...}`.
   Fix empty dialogue text / missing character / `start>=end` warnings.
4. Stats: `GET /audio-plan/stats` (`{plan_json}` body) → dialogue/sfx/music counts,
   unique characters, estimated duration.
5. Hand the plan to generation: speak each dialogue line; `generate_sfx` for SFX;
   `arrange_music` for underscore; then `run_recipe`.

## Worked example
```bash
curl -X POST http://localhost:17493/audio-plan/auto -H 'Content-Type: application/json' -d '{
  "scenes":[{"id":"s1","name":"Introduction","duration":30,
             "dialogue":[{"character":"Narrator","text":"Welcome to the show.","emotion":"neutral"}]}],
  "characters":[{"name":"Narrator"}],"fps":24}'
# → {"plan_json":"{\"scenes\":[{\"tracks\":[{\"track_type\":\"dialogue\",...},
#        {\"track_type\":\"sfx\",...},{\"track_type\":\"music\",...}]}]}"}
```

## Pitfalls / Gotchas
- `/audio-plan/stats` is declared `GET` but takes a JSON body (`PlanSaveRequest`) —
  send the body even though the verb is GET, or it 422s.
- Durations are ESTIMATED (0.08 s/char + 0.5 s gaps); real TTS length may differ — treat
  as a layout guide, not frame-accurate spotting.
- Planning is silent on engine/voice choice; resolve via `list_models` + profile before
  generating each line.

## Cross-links
- [mastering](../../mastering/SKILL.md)
- [engine-atlas](../../engine-atlas/SKILL.md)
- [effects-field-guide](../../effects-field-guide/SKILL.md)

## Validation
- `validate` returns `valid:true` and zero warnings before production.
- `stats` dialogue_lines should equal total dialogue lines supplied.
