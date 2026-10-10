---
name: platform-export
description: One-tap platform delivery presets that normalize to a target LUFS and encode to platform-correct format; use when an agent must "export for Spotify/YouTube/Audible/podcast/movie/voiceover/social".
---
# Platform Export (Delivery Matrix)

## Purpose
`backend/routes/platform_export.py` exposes export presets that normalize a stored clip
to a platform LUFS target and re-encode to the correct format/channels. Non-destructive:
reads input, returns a streaming blob (no source mutation). The CODE presets are the
source of truth (doc 22 differs — see Pitfalls).

## When to use
- "Export this as a podcast / audiobook / movie / voiceover / social clip".
- Final delivery step after `master_audio` / `run_recipe`.
- Listing available delivery targets.

## Prerequisites
- Tool surface: MCP `21labs.list_export_presets` and `21labs.apply_export_preset`, or REST `GET /export/presets` and `POST /export/apply-preset`.
- Inputs: a stored clip path (storage-relative).

## Delivery Matrix (REAL presets from `EXPORT_PRESETS`)
| preset_name | format | sample_rate | bit_depth | channels | target_lufs | true_peak_db |
|-------------|--------|-------------|-----------|----------|-------------|--------------|
| `podcast` | MP3 | 44100 | 16 | stereo | -16.0 | -1.0 |
| `audiobook` | MP3 | 44100 | 16 | mono | -18.0 | -2.0 |
| `movie_audio` | WAV | 48000 | 24 | stereo | -24.0 | -1.0 |
| `voiceover` | WAV | 48000 | 24 | stereo | -12.0 | -1.0 |
| `social_media` | MP3 | 44100 | 16 | stereo | -14.0 | -1.0 |
| `streaming_opus` | OPUS | 48000 | 16 | stereo | -16.0 | -1.0 |
| `archive_aiff` | AIFF | 48000 | 24 | stereo | -16.0 | -1.0 |

### Ideal platform targets (guidance, NOT code-enforced)
| platform | LUFS | true peak | channels | notes |
|----------|------|-----------|----------|-------|
| Spotify | -14 | -1.0 | stereo | re-normalizes to -14 |
| YouTube | -14 | — | stereo | normalized on upload |
| TikTok / Reels / Shorts | -14 | — | mono ok | loud, punchy |
| Audible | -18 to -20 | -2.0 | stereo | -3 dBFS ceiling |
| Theatrical / movie | -24 | -3.0 | 5.1 | film dial norm |
| Broadcast (EBU R128) | -23 | — | stereo | |

## Agent procedure
1. `GET /export/presets` → list available `preset_name`s + specs.
2. `POST /export/apply-preset` with `{"preset_name": "...", "audio_path": "..."}`.
3. Pipeline: match channels → `normalize_to_lufs(audio, sr, target_lufs)` → encode to
   format → stream back as `audio/<format>` blob (Content-Disposition inline).

## Worked example
```bash
curl -X POST http://localhost:17493/export/apply-preset -H 'Content-Type: application/json' \
  -d '{"preset_name":"podcast","audio_path":"recipe_podcast_xyz.wav"}' --output podcast.mp3
```

## Pitfalls / Gotchas
- **Doc 22 is stale.** Trust `EXPORT_PRESETS` in `backend/routes/platform_export.py`.
- Endpoint is `/export/...` (not `/workspace/export` as doc 22 says).
- `21labs.apply_export_preset` and `POST /export/apply-preset` accept `cleanup=false` by default; cleanup runs DeepFilterNet only when explicitly requested.
- Apply-preset does LUFS normalize + format encode; it does NOT run the deesser/music-duck
  pipeline — finish creative work in `run_recipe` first, then export.
- No 5.1 export in code despite the theatrical guidance; `movie_audio` is stereo.

## Cross-links
- [mastering](../mastering/SKILL.md)
- [loudness-metering](../loudness-metering/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- After export, re-measure with `21labs.analyze_loudness`; `integrated_lufs` should
  match the preset `target_lufs`. Confirm channel count/format of the returned blob.
