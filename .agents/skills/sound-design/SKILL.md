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
- At least one audio generation engine available (`stable_audio`, `sa3_sfx`, `acestep_gguf`, or `heartmula`)
- Effects chain available for post-processing

## Parameters / Schema
- **text**: Description of the desired sound (natural language)
- **duration_seconds**: Length in seconds (`generate_sfx`: 0.1–30)
- **engine**: `stable_audio` or `sa3_sfx` for SFX; `acestep_gguf` or `heartmula` for musical textures
- **effects**: Optional post-processing chain

## Agent procedure

### 1. Determine the sound type
- **Human sounds** (laugh, cough, sigh, gasp) → describe them in a Stable Audio prompt; there is no dedicated non-verbal engine in the current set.
- **Musical textures** (pads, drones, risers) → use `generate_music` with `acestep_gguf` or `heartmula`.
- **Everything else** (impacts, ambiences, foley, UI sounds) → use `generate_sfx`.

### 2. Generate the base sound
```
MCP: 21labs.generate_sfx(prompt="...", duration_seconds=2.0)
```

### 3. Post-process with effects
```
MCP: 21labs.apply_effects(
  generation_id="<generation-id>",
  effects_chain=[
    {"type": "eq", "enabled": true, "params": {"low_gain": 0, "mid_gain": 0, "high_gain": 2}},
    {"type": "reverb", "enabled": true, "params": {"room_size": 0.7, "damping": 0.5, "wet": 0.3}},
    {"type": "compressor", "enabled": true, "params": {"threshold": -20, "ratio": 4}}
  ]
)
```

### 4. Layer if needed
For composite sounds, generate multiple layers and sequence or bounce them with story items or `21labs.bounce_preview` using base64 `audio_data`.

### 5. Normalize and export
```
MCP: 21labs.master_audio(
  audio_path="composite.wav",
  target_lufs=-14.0,
  true_peak_db=-1.0
)
MCP: 21labs.apply_export_preset(
  preset_name="social_media",
  audio_path="composite.wav"
)
```

## Worked example: "Create a cinematic impact sound"

1. Generate sub-bass layer: `generate_sfx("deep sub-bass cinematic impact", duration_seconds=2)`
2. Generate texture layer: `generate_sfx("metallic debris scatter", duration_seconds=3)`
3. Generate tail layer: `generate_sfx("dark ambient reverb tail", duration_seconds=4)`
4. Sequence or bounce the layers with story items or `bounce_preview`.
5. Apply processing: `apply_effects(generation_id=..., effects_chain=[compressor, eq, reverb])`.
6. Master: `master_audio(..., target_lufs=-14.0, true_peak_db=-1.0)`.
7. Export: `apply_export_preset(preset_name="social_media", ...)`, unless another preset is requested.

## Pitfalls / Gotchas
- SFX generation is non-deterministic — generate multiple variations and pick the best
- Short sounds (< 1s) may be truncated by some engines — pad with silence if needed
- Layering too many sounds creates mud — keep it to 2-3 layers max
- Always normalize after mixing — layering increases peak levels

## Cross-links
- [sfx-stable-audio](../sfx-stable-audio/SKILL.md) — Stable Audio engine reference
- [music-acestep](../music-acestep/SKILL.md) — ACE-Step-family music textures
- [effects-field-guide](../effects-field-guide/SKILL.md) — All available effects and parameters
- [effects-space](../effects-space/SKILL.md) — Reverb and spatial effects

## Validation
- Generate a 1-second test tone first to verify the engine is loaded
- Check loudness after export (should be -14 to -16 LUFS for SFX)
