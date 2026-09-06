PURPOSE: How to drive the new orchestration + interchange tools — recipe runner, music arrangement, Reaper export, and Voice Changer store commands — from any AI surface.

OWNS: `backend/services/recipe_runner.py`, `backend/services/daw_export.py`, `backend/routes/recipe.py`, `backend/routes/audio_studio.py` (`/export-reaper`), `backend/routes/assistant_tools/` (voice_changer_*).

READ-WHEN: An AI is asked to "make a podcast / audiobook / ad", "export to my DAW", "build a music bed", or "turn on the voice changer".

KEY-FILES: `33-agent-operating-guide.md`, `34-content-recipes.md` (recipes end on `run_recipe`), `37-professional-finishing.md`.

INVARIANTS:
- Everything is non-destructive: `run_recipe` and `export_reaper_project` only read inputs and write new export files; the source generations and session are never overwritten.
- Offline only. Demucs (stems) is an optional dep; if absent the tool returns a clear install hint, never a fake result. Music beds come from Stable Audio Open SFX (`generate_sfx`).

GOTCHAS:
- `run_recipe` takes storage `audio_path`s of already-generated clips (from `generate_speech` results), not raw text. Generate first, then run the recipe.
- Reaper export references audio files by their resolved storage path. Tracks whose `audioUrl` is a browser blob cannot be resolved and are exported without a clip (Reaper shows them empty).

## Tools

### run_recipe
- Assistant: `run_recipe(segments=[{audio_path, effects?}], recipe="podcast", music_path=None, target_lufs=None, gap_ms=250)`
- MCP: `21labs.run_recipe(...)`
- Recipe LUFS defaults: podcast -16, audiobook -18, film-dialogue-adr -24, voiceover-ad -12, social-short -14, youtube -14.
- Per-segment `effects` may include `deesser` and `spectral_denoise` (see `37-professional-finishing.md`).

> `arrange_music` was removed 2026-08 with ACE-Step. For a music bed, generate SFX via
> `generate_sfx` (Stable Audio Open) and pass the path as `music_path` to `run_recipe`.

### export_reaper_project
- Assistant: `export_reaper_project(session_id)`
- MCP: `21labs.export_reaper_project(session_id)` → returns the `.rpp` text.
- Produces a valid Reaper project: one track per session track, clip at timeline origin, master volume preserved. (AAF export is a follow-up; RPP covers practical interchange.)

### Voice Changer (UI commands)
- `voice_changer_enable(enabled)`, `voice_changer_set_profile(profile)`, `voice_changer_set_preset(preset)` — emitted as `command` SSE events the browser applies to the Voice Changer store. Presets: `telephone` (neutral), `deep` (pitch -4 / formant -2), `chipmunk` (pitch +6 / formant +3); any other value sets the preset label only.

## Agent loop addition (post-generation)
After generating + processing clips, finish with `run_recipe` for a broadcast-grade master, then (optionally) save the Audio Studio session and `export_reaper_project` for hand-off to a DAW.

## Agent Callable
- **MCP Tools:** `21labs.run_recipe`, `21labs.export_reaper_project`
- **REST Endpoints:** `POST /recipe/run`, `POST /audio-studio/sessions/{id}/export-reaper`
- **Key Backend Files:** `backend/services/recipe_runner.py`, `backend/services/daw_export.py`, `backend/routes/recipe.py`, `backend/routes/audio_studio.py`
- **Key Frontend Files:** `app/src/features/audioStudio/AudioStudio.tsx`

UPDATED: 2026-07-15
