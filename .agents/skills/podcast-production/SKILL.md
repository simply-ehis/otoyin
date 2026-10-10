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
- Tool surface: `21labs.speak`, `21labs.run_recipe`, `21labs.analyze_loudness`,
  `21labs.apply_export_preset`, `POST /export/apply-preset`, and `POST /transcribe` for chapter markers.
- Engines: 2+ TTS voices for speakers; music bed via Stable Audio Open (`21labs.generate_sfx`).
- Loudness target: podcast = −16 LUFS (stereo, MP3).

## Workflow
1. **Script** → split into speaker turns with a `speaker:` prefix.
2. **Generate** each turn with `21labs.speak(text=..., profile=..., engine=...)`.
   Use different profiles for each speaker. There is no `POST /conversation` render endpoint.
3. **Music bed** → `21labs.generate_sfx(prompt="<mood> ambient bed", duration_seconds=<seconds>)` with Stable Audio Open.
4. **Sequence/mix** → use `21labs.run_recipe(recipe="podcast", segments=[...], music_path="...")`
   (`POST /recipe/run`) for crossfade concat, music-bed ducking, and mastering.
5. **Verify** → `21labs.analyze_loudness(audio_path="<mix>")` should read near −16 LUFS.
6. **Export** → `21labs.apply_export_preset(preset_name="podcast", audio_path="<mix>")`
   (`POST /export/apply-preset`) for stereo MP3.

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
| `21labs.speak` | `POST /generate` | render a TTS line |
| `21labs.generate_sfx` | `POST /generate/sfx` | music bed |
| `21labs.run_recipe` | `POST /recipe/run` | sequence, duck, and master to target LUFS |
| `21labs.analyze_loudness` | `POST /audio/analyze-loudness` | verify level before export |
| `21labs.apply_export_preset` | `POST /export/apply-preset` | stereo MP3 delivery |
| `21labs.transcribe` | `POST /transcribe` | chapter markers from final mix |

## Pitfalls / Gotchas
- **Conversation auto-duck/auto-level return gain math, not mixed audio.** Use `run_recipe` for the actual mix.
- **Export stereo** — even mono voice tracks are mixed to stereo for podcast.
- **Chapter markers** require a separate `transcribe` pass over the final mix.
- **Offline only** — all engines must be downloaded. Missing engine → HTTP 400.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [tts-kokoro](../tts-kokoro/SKILL.md)
- [sfx-stable-audio](../sfx-stable-audio/SKILL.md) — for SFX bed
- [loudness-metering](../loudness-metering/SKILL.md)

## Validation
- After `run_recipe`, `analyze_loudness` returns −16.0 ±0.5 LUFS.
- Export produces a stereo MP3 that plays back at the right level.
- Multi-speaker renders have smooth transitions (no dead air between turns).
