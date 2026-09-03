---
name: sound-design
description: Create custom sound effects and ambient textures using synthesis, sampling, and effects processing. Use when a user asks for a "sound effect", "ambient texture", "foley", "riser", "impact", or any non-speech/non-music audio element.
---
# Sound Design

## Purpose
Create custom sound effects and ambient textures from scratch using otoyin's synthesis, sampling, and effects tools.

## When to use
- User asks for a specific sound effect (door creak, rain, explosion, etc.)
- User needs ambient textures or atmospheres
- User wants custom foley or UI sounds
- User asks for risers, impacts, transitions, or stingers
- User wants to layer multiple sounds into a composite effect

## Prerequisites
- At least one audio generation engine available (Stable Audio, ACE-Step, or Bark SFX)
- Effects chain available for post-processing

## Parameters / Schema
- **text**: Description of the desired sound (natural language)
- **duration**: Length in seconds (1-30 typical)
- **engine**: `stable_audio` (default, best for SFX), `bark_sfx` (human sounds), `ace_step` (musical textures)
- **effects**: Optional post-processing chain

## Agent procedure

### 1. Determine the sound type
- **Human sounds** (laugh, cough, sigh, gasp) → use `bark_sfx`
- **Musical textures** (pads, drones, risers) → use `ace_step` or `generate_music`
- **Everything else** (impacts, ambiences, foley, UI sounds) → use `generate_sfx`

### 2. Generate the base sound
```
MCP: 21labs.generate_sfx(prompt="...", duration=N)
Assistant: generate_speech (with SFX-capable engine)
```

### 3. Post-process with effects
```
MCP: 21labs.apply_effects(
  effects=[
    {"type": "eq", "params": {"low_freq": 100, "high_freq": 8000}},
    {"type": "reverb", "params": {"room_size": 0.7, "wet_level": 0.3}},
    {"type": "compressor", "params": {"threshold": -20, "ratio": 4}}
  ]
)
```

### 4. Layer if needed
For composite sounds, generate multiple layers and mix:
```
MCP: 21labs.splice_audio(files=["impact.wav", " debris.wav", " rumble.wav"], operation="mix")
```

### 5. Normalize and export
```
MCP: 21labs.normalize_audio(target_lufs=-14)
MCP: 21labs.export_audio(filename="my_sfx.wav")
```

## Worked example: "Create a cinematic impact sound"

1. Generate sub-bass layer: `generate_sfx("deep sub-bass cinematic impact", duration=2)`
2. Generate texture layer: `generate_sfx("metallic debris scatter", duration=3)`
3. Generate tail layer: `generate_sfx("dark ambient reverb tail", duration=4)`
4. Mix layers: `splice_audio(files=[...], operation="mix")`
5. Apply processing: `apply_effects(effects=[compressor, eq, reverb])`
6. Normalize: `normalize_audio(target_lufs=-14)`
7. Export: `export_audio(filename="cinematic_impact.wav")`

## Pitfalls / Gotchas
- SFX generation is non-deterministic — generate multiple variations and pick the best
- Short sounds (< 1s) may be truncated by some engines — pad with silence if needed
- Layering too many sounds creates mud — keep it to 2-3 layers max
- Always normalize after mixing — layering increases peak levels

## Cross-links
- `sfx-stable-audio` — Stable Audio engine reference
- `bark-sfx` — Bark SFX engine for human sounds
- `music-acestep` — ACE-Step for musical textures
- `effects-field-guide` — All available effects and parameters
- `effects-space` — Reverb and spatial effects

## Validation
- Generate a 1-second test tone first to verify the engine is loaded
- Check loudness after export (should be -14 to -16 LUFS for SFX)
