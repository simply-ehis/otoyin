# 34 — Content Recipes

PURPOSE: Reusable recipes that map a content type to the exact engines, effects, and export preset an agent should use. So "make a podcast" becomes a deterministic tool chain, not a guess.
OWNS: docs/knowledge/34-content-recipes.md
READ-WHEN: An agent is asked to produce a specific kind of audio (podcast, film dialogue, audiobook, social, voiceover, YouTube).
KEY-FILES: backend/routes/conversation.py, backend/routes/adr.py, backend/routes/platform_export.py, backend/routes/effects.py
INVARIANTS: Each recipe names a concrete export preset + LUFS target. Recipes are non-destructive; they produce new audio, never mutate sources.
GOTCHAS: Engine choice depends on what is downloaded (`list_models`). If a chosen engine is unavailable, fall back and tell the user. The recipe runner (Phase 4 #8) will execute these chains automatically.
UPDATED: 2026-07-15

## Recipes (summary)

| Recipe | Primary path | Engine(s) | Export preset | LUFS | Notes |
|--------|-------------|-----------|---------------|------|-------|
| Podcast / multi-host | Conversation mode | Cloned profiles per host | Podcast | −16 | Auto-duck + level-match; mono. |
| Film/TV dialogue + ADR | ADR sessions | Cloned dialogue profile | Movie Audio | −24 | Guide track + take scoring; 5.1. |
| Audiobook | Single narrator | 1 cloned narrator | Audiobook | −18 | Stereo FLAC; character voices per chapter. |
| Social / short | TTS + SFX | Kokoro/Fish Speech | Social Media | −14 | Mono AAC; punchy, fast. |
| Voiceover / ad | TTS | Kokoro/Zonos | Voiceover | −12 | Mono WAV; bright, intimate. |
| YouTube / long-form | TTS + music bed | Cloned host + Stable Audio Open SFX | Social Media | −14 | Music ducked under voice; intro/outro. |

Full per-recipe playbooks: `.agents/skills/otoyin-studio/recipe-*.md`.

## RECIPE TEMPLATE (copy for new content types)

```markdown
# Recipe: <name>

## Goal
<one sentence: what kind of audio this produces>

## Engine choice
- TTS: <engine> (why)
- STT (if needed): faster-whisper
- Music/SFX: <engine> (if needed)

## Voice
- Profile: <cloned vs preset, personality?>
- Per-speaker assignment: <how>

## Production path
1. <generate / ADR / conversation / stories step>
2. <effects chain: list effect_ids + params>
3. <mixing: auto-duck, level-match, bus routing>
4. <mastering (Phase 4 #2) if broadcast grade>

## Export
- Preset: <Podcast/Audiobook/Movie Audio/Voiceover/Social Media>
- LUFS target: <value>
- Channels / format: <mono/stereo/5.1, codec>

## Caveats
- <offline limits, engine fallback, length limits>
```

## How an agent uses a recipe

1. Read the recipe. Resolve engines via `list_models`; if unavailable, pick the nearest fallback and say so.
2. Follow the production path as an ordered tool chain. Keep every step non-destructive.
3. Export with the named preset. Verify loudness with `measure_loudness` before delivering.
4. (Phase 4) Or call `run_recipe(name, params)` and let `recipe_runner.py` execute steps 1–3.

## Agent Callable
- **MCP Tools:** `21labs.run_recipe`, `21labs.list_models`, `21labs.analyze_loudness`, `21labs.master_audio`, `21labs.export_reaper_project`
- **REST Endpoints:** `POST /recipe/run`, `POST /audio/master`, `POST /audio-studio/sessions/{id}/export-reaper`, `GET /conversation/presets`, `GET /export/presets`
- **Key Backend Files:** `backend/services/recipe_runner.py`, `backend/routes/recipe.py`, `backend/services/daw_export.py`, `backend/routes/audio_studio.py`
- **Key Frontend Files:** `app/src/features/workspace/ConversationView.tsx`, `app/src/features/workspace/PlatformExportView.tsx`
