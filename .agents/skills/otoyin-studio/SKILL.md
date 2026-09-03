---
name: otoyin-studio
description: Use this skill when an AI agent must operate otoyin (offline AI voice studio) to produce speech, dialogue, music, or mixed audio. It gives the operating loop, content-type recipes, dialogue methodology, and the terse audio-director persona (see AGENTS.md). Load it before calling any otoyin tool via the in-app assistant or the MCP server at /mcp.
---

# otoyin Studio — Agent Skill

otoyin is an offline/on-device AI voice studio: TTS (13 engines), voice cloning, ADR, a
multitrack DAW, SFX generation, effects, and export. This skill is the single source of truth
for how an agent drives it. The same content lives in `docs/knowledge/` so the in-app assistant and
external MCP agents agree.

## Read these, in order, before acting
1. `AGENTS.md` — the audio-director persona and hard constraints. Non-negotiable.
2. `33-agent-operating-guide.md` (in `docs/knowledge/`) — the generate→effects→export loop and the
   two tool surfaces (in-app assistant vs MCP).
3. `34-content-recipes.md` + the `recipe-*.md` files here — pick the recipe that matches the request.
4. `35-dialogue-methodology.md` (or `dialogue-methodology.md` here) — for any multi-speaker speech.
5. `36-missing-features-inventory.md` — when a capability exists in code but isn't on the tool
   surface yet.

## When to use
- "Make a podcast / audiobook / voiceover / YouTube narration."
- "Generate dialogue between two characters." / "Do an ADR pass."
- "Add reverb / clean this noise / master this clip."
- "Export for Spotify / Audible / a movie / TikTok."
- Any task an audio director would take on, done entirely on-device.

## Hard rules (expanded in AGENTS.md)
- Offline only. No cloud. Local models (faster-whisper, Stable Audio, gguf_llm).
- Non-destructive. New audio every step; never overwrite a source generation.
- Lower-risk agent control only: navigation + Audio Studio + store setters. No live voice-changer /
  timeline / comping audio-graph mutation.
- Every tool call maps to a real REST endpoint. Audio returns as a saved path (assistant) or base64
  WAV (MCP). Verify with `measure_loudness` before export.

## Quick-start decision tree
1. **What is the deliverable?**
   - Speech / voice → pick an engine (`engine-atlas`) or a dialogue mode.
   - Music / SFX → `sfx-stable-audio`, `virtual-instruments-gm`, `drum-machine`, `procedural-instruments`.
   - Shape / fix audio → `effects-field-guide` → `effects-dynamics` / `-tone` / `-space` / `-cleanup`, then `mastering`.
   - Deliver to a platform → `platform-export`.
   - Drive programmatically → `mcp-tool-reference` + `agent-operating-guide`.
2. **Multi-speaker?** → `dialogue-methodology` (flowchart) → `conversation-mode` / `adr-mode` / `stories-mode`.
3. **Need one specific effect?** → `effects-field-guide` (which path: chain vs `run_recipe`).
4. **Broken / off-spec?** → `troubleshooting`.

## Recipe → request mapping
| request | recipe file | primary skills |
|---------|-----------|----------------|
| Podcast / multi-host | `recipe-podcast.md` | conversation-mode, mastering, engine-atlas |
| Audiobook | `recipe-audiobook.md` | mastering, voice-profiles, loudness-metering |
| Film/TV dialogue + ADR | `recipe-film-dialogue-adr.md` | adr-mode, mastering |
| Social / short | `recipe-social-short.md` | mastering, effects-dynamics, sfx-stable-audio |
| Voiceover / ad | `recipe-voiceover-ad.md` | mastering, effects-tone, effects-cleanup |
| YouTube / explainer | `recipe-youtube.md` | sfx-stable-audio, mastering, platform-export |

## File dependency graph
```
SKILL.md (you are here)
  ├─ AGENTS.md ............ persona + engine-fallback / effects / voice-selection tables
  ├─ RECIPE-TEMPLATE.md ... copy to add a content type
  ├─ recipe-*.md (6) ...... per-content-type chains (now with param tables)
  ├─ dialogue-methodology.md  (mirror) ──▶ dialogue-methodology/ SKILL
  ├─ batch-queue.md (mirror)  ──▶ batch-queue/ SKILL
  └─ Production skill library (63 skills, see below) ── referenced by every recipe
```

## Production skill library (63 skills)
Grouped by layer. Each is a folder `../<name>/SKILL.md`. Load the one that matches the task.
- **TTS engines (13 families, see engine-atlas):** tts-kokoro, tts-fish-speech (live skill pages) — qwen, qwen_custom_voice, step_audio_editx, pocket_emo, tts-chatterbox, tts-chatterbox-turbo, tts-xtts-v2, tts-piper, tts-luxtts, tts-tada (all REMOVED, pages retained for history)
- **Voice:** voice-profiles, voice-cloning, voice-changer
- **Music & instruments:** sfx-stable-audio, virtual-instruments-gm, drum-machine, procedural-instruments (music-acestep, bark-sfx removed)
- **Effects:** effects-field-guide, effects-dynamics, effects-tone, effects-space, effects-cleanup, mixer
- **Dialogue & edit:** conversation-mode, adr-mode, stories-mode, multi-take-comping, dialogue-methodology, transcript-edit
- **Mastering & delivery:** loudness-metering, mastering, platform-export, noise-reduction, audio-plan, automation-cues
- **Atlas & ops:** engine-atlas, agent-operating-guide, mcp-tool-reference, troubleshooting, stt-whisper, llm-assistant, batch-queue

## Files in this skill
- `AGENTS.md` — persona + constraints + fallback/quick-ref tables.
- `RECIPE-TEMPLATE.md` — copy to add a new content type.
- `recipe-podcast.md`, `recipe-film-dialogue-adr.md`, `recipe-audiobook.md`,
  `recipe-social-short.md`, `recipe-voiceover-ad.md`, `recipe-youtube.md`.
- `dialogue-methodology.md`, `batch-queue.md` — mirrors of the knowledge docs for offline agents.
