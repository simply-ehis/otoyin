---
name: podcast-production
description: End-to-end podcast workflow — multi-speaker Conversation mode → AutoDuck → loudness mastering (podcast −16 LUFS) → MP3 stereo export.
---
# Podcast Production

## Purpose
Turn a multi-speaker script into a finished podcast: render each voice via
Conversation mode, auto-duck background music/speakers when someone talks,
master to −16 LUFS, and export as stereo MP3.

## When to use
- User says "make a podcast", "record a conversation between two people".
- Multi-speaker narration with music bed that ducks under dialogue.
- Need a broadcast-ready file (stereo MP3, −16 LUFS).

## Prerequisites
- Tool surface: `21labs.generate` (Conversation mode), `21labs.run_recipe`,
  `POST /audio/bounce`, `POST /transcription` (optional chapter markers).
- Engines: 2+ TTS voices for speakers; music bed via Stable Audio Open (`generate_sfx`).
- Loudness target: podcast = −16 LUFS (stereo, MP3).

## Workflow (REAL, from `agent-operating-guide` + `loudness-metering`)
1. **Script** → split into speaker turns with a `speaker:` prefix.
2. **Generate** each turn with `21labs.generate(text=...)`. Use different
   profiles for each speaker. For conversational flow, use **Conversation mode**
   (`POST /conversation` — renders → auto-ducks → auto-levels).
3. **Music bed** → `21labs.generate_sfx(prompt="<mood> ambient bed")` with Stable Audio Open.
4. **AutoDuck** → applies RMS-smoothed sidechain: duckGain + duckMeter (attack 0.3s,
   release 0.02s), triggered by speech energy above −20 dBFS.
5. **Master** → `21labs.run_recipe(preset="podcast")` masters to −16 LUFS.
   The mastering chain: de-ess + spectral denoise per segment + master.
6. **Export** → `POST /audio/bounce` with `{"format": "mp3", "channels": 2}`
   produces a stereo MP3.

## Loudness targets (from AGENTS.md)
| target | LUFS | export preset |
|--------|------|---------------|
| Podcast | −16 | MP3, stereo |
| Audiobook | −18 | MP3, mono |
| Movie | −24 | WAV 24-bit, stereo |
| Voiceover | −12 | WAV 24-bit, stereo |
| Social / YouTube | −14 | MP3, stereo |

> `run_recipe` and platform-export presets now use the SAME targets — mastering
> then exporting keeps one consistent loudness.

## Tools
| MCP | REST | purpose |
|-----|------|---------|
| `21labs.generate` | `POST /generate` | render a TTS line |
| `21labs.generate_sfx` | `POST /generate/sfx` | music bed |
| `21labs.run_recipe` | `POST /audio/run_recipe` | one-step master to target LUFS |
| `21labs.measure_loudness` | `POST /dsp/measure-loudness` | verify level before export |
| `21labs.transcribe` | `POST /transcribe` | chapter markers from final mix |

## Pitfalls / Gotchas
- **AutoDuck is not a plugin** — it's baked into Conversation mode's real-time
  mixer. You cannot toggle it per-track; it's always on for the music bed.
- **Export stereo** — even mono voice tracks are mixed to stereo for podcast.
- **Chapter markers** require a separate `transcribe` pass over the final mix.
- **Offline only** — all engines must be downloaded. Missing engine → HTTP 400.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [tts-kokoro](../tts-kokoro/SKILL.md)
- [sfx-stable-audio](../sfx-stable-audio/SKILL.md) — for SFX bed
- [loudness-metering](../loudness-metering/SKILL.md)

## Validation
- After `run_recipe`, `measure_loudness` returns −16.0 ±0.5 LUFS.
- Export produces a stereo MP3 that plays back at the right level.
- Multi-speaker renders have smooth transitions (no dead air between turns).
