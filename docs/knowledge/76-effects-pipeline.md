# Effects Pipeline Architecture

> **PURPOSE** — How otoyin's two effects processing paths work and when each is used.
> **OWNS** — The effects system (effects_chain + run_recipe).
> **READ-WHEN** — Applying effects, debugging processing issues, or extending the effects system.

## Two paths, one goal

otonin has two separate effects processing paths. They serve different purposes and should not be confused:

### Path 1: Effects Chain (single-clip post-processing)

**Used for**: Applying effects to a single audio clip (one file in, one file out).

**Entry points**:
- `POST /effects/apply` — REST API
- `21labs.apply_effects` — MCP tool
- Effects chain UI in Audio Studio (per-clip)

**Implementation**: `backend/services/effects_chain.py` (numpy/scipy) or `backend/utils/effects.py` (pedalboard)

**Available effects**: EQ, compressor, noise gate, reverb, delay, chorus, flanger, phaser, de-esser, pitch shift, formant shift, time stretch, limiter, normalize

**When to use**: You have a single clip and want to add reverb, EQ, compression, etc.

### Path 2: Recipe Runner (multi-segment production pipeline)

**Used for**: Running a complete production workflow across multiple clips (e.g., podcast with auto-duck, loudness normalization, export).

**Entry points**:
- `POST /recipe/run` — REST API
- `21labs.run_recipe` — MCP tool
- Recipe button in Stories/Audio Studio

**Implementation**: `backend/services/recipe_runner.py`

**When to use**: You have a multi-track project and need automatic ducking, level matching, and export in one pass.

## How they relate

```
Single clip → effects_chain → processed clip
                                    ↓
Multi-track project → recipe_runner → mixed + mastered output
                                         (uses effects_chain internally)
```

The recipe runner calls the effects chain internally for per-clip processing, then adds mixing, ducking, and mastering on top.

## Effects Chain Details

### Effect types

| Effect | Category | Key Parameters |
|--------|----------|---------------|
| EQ (3-band shelving) | Tone | low_freq, high_freq, low_gain, high_gain |
| Compressor | Dynamics | threshold, ratio, attack, release |
| Noise Gate | Dynamics | threshold, attack, release |
| Reverb | Space | room_size, damping, wet_level, dry_level |
| Delay | Space | delay_ms, feedback, wet_level |
| Chorus | Modulation | rate, depth, mix |
| Flanger | Modulation | rate, depth, feedback |
| Phaser | Modulation | rate, depth, feedback |
| De-esser | Cleanup | frequency, threshold |
| Pitch Shift | Tone | semitones |
| Formant Shift | Tone | formant_shift |
| Time Stretch | Time | rate |
| Limiter | Dynamics | threshold, release |
| Normalize | Dynamics | target_lufs |

### Applying effects

Via API:
```json
POST /effects/apply
{
  "audio_path": "input.wav",
  "effects": [
    {"type": "eq", "params": {"low_freq": 100, "high_freq": 8000}},
    {"type": "compressor", "params": {"threshold": -20, "ratio": 4}},
    {"type": "reverb", "params": {"room_size": 0.5, "wet_level": 0.3}}
  ]
}
```

### Presets

Save and reuse effect chains:
```json
POST /effects/presets
{
  "name": "Podcast Voice",
  "effects": [
    {"type": "eq", "params": {...}},
    {"type": "compressor", "params": {...}}
  ]
}
```

## Recipe Runner Details

### Recipe types

| Recipe | What it does |
|--------|-------------|
| podcast | Auto-duck music, level voices, -16 LUFS |
| audiobook | Multi-chapter render, per-voice casting |
| film-dialogue-adr | ADR session mix with guide track |
| social-short | Short-form content, -14 LUFS |
| voiceover-ad | Single-speaker ad, -16 LUFS |
| youtube | YouTube delivery, -14 LUFS |

### Running a recipe

Via API:
```json
POST /recipe/run
{
  "recipe": "podcast",
  "tracks": [
    {"clip_id": "uuid1", "role": "voice", "track": 0},
    {"clip_id": "uuid2", "role": "music", "track": 1}
  ]
}
```

## Common Pitfalls

- **Don't apply effects_chain to an already-processed clip** — cumulative processing degrades quality
- **Use recipe_runner for multi-track** — don't try to mix clips manually with effects_chain
- **Effects are non-destructive** — the original file is preserved; effects create a new file
- **Order matters** — EQ before compression sounds different than compression before EQ
- **De-esser before compression** — de-essing after compression amplifies sibilance

## Cross-links

- `effects-field-guide` — Complete effects catalog
- `effects-dynamics` — Compressor and noise gate
- `effects-tone` — EQ, pitch shift, formant shift
- `effects-space` — Reverb, delay, spatial
- `effects-cleanup` — De-esser, denoise, noise gate
- `noise-reduction` — RNNoise vs spectral denoise
- `mastering` — Final loudness and limiting
- `06-mixer.md` — Multi-track mixer
