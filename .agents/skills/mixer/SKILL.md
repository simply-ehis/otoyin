---
name: mixer
description: Multi-track mixer reference for otoyin — VU/mute/solo/pan/bus routing, per-track effects, and auto-duck (speech ducks music bed) via conversation + recipe endpoints.
---
# Mixer (Multi-Track)

## Purpose
Combine multiple generated tracks into a final stereo mix: per-channel volume, pan,
mute/solo, bus routing, per-track effects_chain, and an auto-duck envelope so
speech sits above a music bed. Engine: `backend/services/mixer.py` `mix_with_buses`.

## When to use
- Laying voice + BG music + SFX together (audiobook, ad, podcast).
- Ducking music under narration.
- Level/pan/balance a multi-speaker conversation.

## Tool surface / endpoints
| endpoint | purpose |
|----------|---------|
| `POST /mixer/preview` | mix story items → streamed WAV (no save). Body: `MixerExportRequest{story_id, mixer_state{buses, master_volume}}` |
| `POST /audio/loudness` | channel-level LUFS metering (drives VU levels) |
| `POST /conversation/auto-duck` | compute per-speaker duck gains (MCP `21labs.conversation_auto_duck`) |
| `POST /conversation/auto-level` | level-match all speakers to -16 LUFS (MCP `21labs.conversation_auto_level`) |
| `GET /conversation/presets` | debate / podcast_interview / podcast_panel / dramatic_dialogue |

## Mixer model (REAL, `backend/services/mixer.py`)
- `TrackConfig(id, name, volume, bus_id, effects_chain)` — volume default ~0.75;
  pan via bus. `BusConfig(id, name, volume, pan)`.
- Each track's `effects_chain` (list of `EffectConfig`) is applied via
  `apply_effects_chain` before mixing — so EQ/compressor/deesser per track work here.
- `mix_with_buses(track_data, bus_data, sr, total_samples, master_volume)` → (left, right).
- Frontend strips: VU (green<60%, yellow<80%, red≥80%), faders 0–1 step 0.01,
  pan -1..1 (`left:((pan+1)/2)*100%`), mute/solo toggles.

## Auto-duck — how it actually works
**Two distinct mechanisms:**

1. **Recipe music-bed duck** (`recipe_runner.recipe_run`): if you pass `music_path`,
   the music is resampled/aligned and **ducked under the speech** automatically
   during the build. This is the real "speech ducks music" path. Use `run_recipe`
   with a `music_path` for narration-over-music.

2. **`POST /conversation/auto-duck`** (`21labs.conversation_auto_duck`): given a
   list of `ConversationLine` dicts (`id,text,speaker,engine,start_offset_ms,track,...`),
   it returns `{"gains":[...]}` — one gain per line. Logic: for same-`track` lines
   that overlap in time, gain = `min(gain, -6.0 * overlap_seconds)`, floored at
   **-12 dB**. It COMPUTES the envelope; the caller applies the gains. It does not
   itself render audio.

> Gotcha: `conversation_auto_duck` only ducks *same-track overlapping speakers*;
> it is a gain calculator, not a music-bed-under-speech renderer. For music ducking,
> use `run_recipe(music_path=...)`.

## Worked example
```bash
# 1) Compute duck gains for overlapping speakers
curl -X POST "http://localhost:17493/conversation/auto-duck" -H "Content-Type: application/json" \
  -d '{"lines":[
    {"id":"l1","text":"...","speaker":"Host","start_offset_ms":0,"track":0},
    {"id":"l2","text":"...","speaker":"Guest","start_offset_ms":4200,"track":0}
  ]}'
# -> {"gains":[0.0, -4.8]}  (0.8 s overlap -> -6*0.8 = -4.8 dB)

# 2) Mix a story (tracks already carry effects_chain + volume)
curl -X POST "http://localhost:17493/mixer/preview" -H "Content-Type: application/json" \
  -d '{"story_id":"<id>","mixer_state":{"buses":[],"master_volume":0.9}}'
```

## Pitfalls
- Auto-duck returns gains, not audio — you must apply them (e.g. as track volume).
- Per-track effects_chain in the mixer uses `effects_chain.EffectConfig` (types like
  `eq`, `compressor`, `deesser`, `spectral_denoise`) — same type keys as Path A.
- For music-under-speech, use `run_recipe(music_path=...)`, not auto-duck.

## Cross-links
- [effects-field-guide](../../effects-field-guide/SKILL.md)
- [conversation-mode](../../conversation-mode/SKILL.md)
- [mastering](../../mastering/SKILL.md)

## Validation
- Mix preview plays all tracks balanced; speech clearly above music bed.
- VU levels stay under red (≤80%) at master.
