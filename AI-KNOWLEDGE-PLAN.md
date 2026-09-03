# Plan — otoyin: AI Knowledge Surface, Creative Skills, and Quality Upgrades

Status: APPROVED. Build mode.
Owner: any agent working in this repo.
Last updated: 2026-07-15

## Baseline (proved by code scan)
- 194 real backend endpoints across 40 route modules (README's "195 endpoints" confirmed).
- 16 features are coded but invisible to any AI: Audio Channels, Stories editor, Standalone
  Project, Voice-Changer capabilities, A/B Comparison, CUDA/GPU backend, Telemetry, MCP
  bindings mgmt, Generation versioning, Extended import, Generation import, Server Settings,
  Accessibility/InputMonitoring gates, Dictate, Refinement, Local LLM generate.
- Assistant `assistant_tools.py`: 28 tools. Missing ~25 backend capabilities.
- MCP `mcp_server/tools.py`: 10 tools. Same holes, plus no conversation/stories/channels/project.
- `docs/knowledge/00-index.md` is stale (lists 3 docs; 50+ exist). Must be rebuilt.
- Genuine capability gaps (no code): no stem separation, no mastering chain (only true_peak in
  export), voice-changer live control excluded from agents, real-time overdub disabled
  (`handleStartRecording` early-returns when `isPlaying`), no DAW interchange (AAF/Reaper).

## Phases

### Phase 0 — Knowledge foundation (`docs/knowledge/`)
- Rebuild `00-index.md` to catalog all docs.
- New docs (7-line greppable headers per repo convention):
  - `33-agent-operating-guide.md` — generate→effects→export loop, profiles, models, captures,
    navigation, non-destructive/offline invariants.
  - `34-content-recipes.md` — index + reusable RECIPE TEMPLATE covering: Podcast/multi-host,
    Film-TV dialogue+ADR, Audiobook, Social/short, Voiceover/ad, YouTube/long-form explainer.
  - `35-dialogue-methodology.md` — ADR sessions (guide/takes/scoring) + Conversation mode
    (timed lines, auto-duck, level-match) + multi-take comping + channels.
  - `36-missing-features-inventory.md` — the 16 features, each with endpoint map.
  - Enhance existing `10-batch-processing.md` (the queue doc) with agent workflow notes.

### Phase 1 — Skills + AGENTS.md (both systems)
Create `.agents/skills/21-labs-studio/`:
- `SKILL.md` (frontmatter name/description) — when to use; points to operating guide + recipes.
- `AGENTS.md` — terse audio-director persona aligned to `CLAUDE.md`/`SKILL.md` (direct,
  opinionated, anti-generic): who it is, how it picks engines/effects/export per content type,
  hard constraints (offline/on-device, non-destructive, every tool gets a knowledge doc + test).
- Recipe docs (`recipe-podcast.md`, `recipe-film-dialogue-adr.md`, `recipe-audiobook.md`,
  `recipe-social-short.md`, `recipe-voiceover-ad.md`, `recipe-youtube.md`) + `RECIPE-TEMPLATE.md`.
- `dialogue-methodology.md`, `batch-queue.md` (mirror Phase 0).

### Phase 2 — Wire missing features into the in-app assistant
Extend `backend/routes/assistant_tools.py` (`TOOLS` + `ENDPOINT_MAP` + `TOOL_METHODS` +
`CLIENT_COMMAND_TOOLS`):
- Backend-backed: channels CRUD+voices, stories create/item-edit/export-audio, project
  create/save/load/templates, conversation render/auto-duck/level-match, batch create/list/cancel,
  community presets list/categories, preset import/export, normalize/compress/duck/silence-removal/
  bounce-preview, spectrogram, scripting execute, plugins scan/process, voice-changer/capabilities,
  generation import, captures refine/retranscribe, models download/load/unload, telemetry toggle,
  CUDA status/download, generation versioning.
- UI command tools (lower-risk only): navigate to stories/project/plugins/views, set profile/engine.
- Update `TOOL-REFERENCE.md` system prompt to embed recipe index + dialogue methodology.
- `pytest` per new tool.

### Phase 3 — Wire missing features into MCP
Extend `backend/mcp_server/tools.py` `register_tools` with dotted tools for the same surface.
Update `mcp-audio-orchestration.md` + add `mcp-tools-extended.md`; cross-link from `00-index.md`.
Add tests.

### Phase 4 — Quality upgrades (genuine new product code)
1. [DONE] Stem separation (`services/stem_separation.py`, Demucs, gated optional dep) +
   `POST /audio/separate` + `separate_audio` (assistant) + `21labs.separate_audio` (MCP).
2. [DONE] Mastering chain (`services/mastering.py`: glue compressor + true-peak limiter + stereo
   widener + LUFS target) + `POST /audio/master` + `master_audio` (assistant) + `21labs.master_audio` (MCP).
3. [DONE] Voice-changer agent control (lower-risk store setters): `voice_changer_enable` / `_set_profile` /
    `_set_preset` UI-command tools + `useVoiceChangerStore` + command handler in `assistantCommands.ts`.
    NOTE: voice-changer control is intentionally **not** mirrored to MCP — MCP clients run headless with
    no browser/React store, so UI-command intents cannot reach `useVoiceChangerStore`. The assistant
    surface keeps these three tools; MCP gets the rest. (Documented, not a gap to fake.)
4. [DONE] Real-time overdub: removed `isPlaying` early-return in `handleStartRecording` (AudioStudio.tsx:1037).
5. [DONE] Vocal effects: de-esser + spectral de-noise registered in effects_extended.py / effects_chain.py / EFFECT_TYPES.
6. [DONE] DAW interchange: Reaper `.rpp` export from Audio Studio sessions (`services/daw_export.py` +
   `POST /audio-studio/sessions/{id}/export-reaper`). AAF is a documented follow-up.
7. [DONE] Music arrangement: `arrange_music` builds a structured ACE-Step prompt + optional stem separation.
8. [DONE] Recipe runner (`services/recipe_runner.py` + `POST /recipe/run`) orchestrates named recipe
   end-to-end; exposed as `21labs.run_recipe` (MCP) + `run_recipe` (assistant).

### Phase 5 — Verification & wrap-up
- `just check`, `bunx tsc --noEmit`, `bunx biome check`, `pytest`, frontend build.
- Per repo rules: every feature ships with knowledge doc + gate test + eval; update index docs.
- Manual: run a podcast recipe and a film-dialogue+ADR render via both assistant and MCP client;
  confirm `AGENTS.md` persona loads for an external agent.

## Open risks
- Stem separation & mastering add heavy optional deps — gate behind model download (like CUDA).
- Recipe runner must stay non-destructive and offline.
- Read exact route signatures, `handleStartRecording` location, and Zustand stores before editing.

## Follow-ups (post-Phase 5) — DONE
- All 6 recipe docs (`recipe-*.md`) now end on `run_recipe`; podcast fixed to drop the non-existent
  `POST /conversation/render` (multi-speaker = `generate_speech` per line + `auto-duck`/`auto-level`).
  Voice-changer preset now auto-enables via `setEnabled(true)` (lower-risk store setter). Committed `ce7706a`.
- MCP smoke test against a live server: 70 tools present, `21labs.master_audio` returned a real
  mastered WAV (verified 2.0s / 24 kHz / peak 0.316). Smoke test surfaced a real bug — `mcp_server/tools.py`
  used `httpx.AsyncClient` in `_rest()` without importing it, breaking **every** REST-backed MCP tool
  (`NameError: name 'httpx' is not defined`). Fixed with `import httpx`; committed `448ce9c`.
- The running `127.0.0.1:17493` instance was restarted to pick up the `httpx` fix.
