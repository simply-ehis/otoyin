---
name: music-production
description: Create music beds, loops, and backing tracks using ACE-Step, Stable Audio, or GM instruments. Use when a user asks for "music", "a beat", "background music", "a loop", "a jingle", or any musical element for their project.
---
# Music Production

## Purpose
Create original music — from simple loops to full arrangements — using otoyin's music engines and instrument tools.

## When to use
- User needs background music for a podcast, video, or presentation
- User wants a specific genre or mood track
- User needs a loop, jingle, or sting
- User wants to compose with virtual instruments
- User needs drum patterns or beats

## Prerequisites
- At least one music engine available (`acestep_gguf`, `heartmula`, or Stable Audio for beds)
- Optional: SoundFont for GM instruments

## Parameters / Schema
- **prompt**: Natural language description of the music
- **duration_seconds**: Length in seconds (`generate_music`: 1–300; `generate_sfx`: 0.1–30)
- **tempo**: BPM in `[40,240]` (optional; only some music engines use it)
- **genre**: Style hint (optional)
- **mode**: `generate`, `cover`, or `repaint` for music engines

## Agent procedure

### 1. Determine the music type

| Request | Best engine | Why |
|---------|-------------|-----|
| Full song with lyrics | ACE-Step GGUF | Supports singing |
| Instrumental background | ACE-Step GGUF or Stable Audio | Both handle this well |
| Short loop/jingle | ACE-Step GGUF | Generate a short bed, then sequence/repeat it |
| Drum pattern | Drum Machine | Step-sequenced percussion |
| Single instrument note | Procedural instruments | Piano, synth, drum hits |

### 2. Generate the music
```
MCP: 21labs.generate_music(
  engine="acestep_gguf",
  prompt="upbeat corporate background music, positive, 120 BPM",
  duration_seconds=30,
  genre="corporate",
  mood="positive",
  tempo=120
)
```

### 3. Post-process
```
MCP: 21labs.apply_effects(
  generation_id="<generation-id>",
  effects_chain=[
    {"type": "eq", "enabled": true, "params": {"low_gain": 0, "mid_gain": 0, "high_gain": 2}},
    {"type": "compressor", "enabled": true, "params": {"threshold": -18, "ratio": 3}}
  ]
)
```

### 4. Loop if needed
For background beds that need to repeat, generate a short bed and sequence repeats with story items or `run_recipe`; there is no dedicated loop-generation mode.

### 5. Mix with other elements
Use story sequencing for timed placement, or `21labs.bounce_preview` with base64 `audio_data` tracks for ad-hoc mixing.

### 6. Master to target loudness
```
MCP: 21labs.master_audio(
  audio_path="music.wav",
  target_lufs=-16.0,
  true_peak_db=-1.0
)
```
`normalize_audio` adjusts peak level only; it does not set LUFS.

## Music prompt tips
- Be specific about genre: "lo-fi hip hop" not just "music"
- Include mood: "energetic", "calm", "dark", "uplifting"
- Specify instruments: "acoustic guitar", "synth pads", "piano"
- Mention tempo if relevant: "120 BPM", "slow", "upbeat"
- Reference structure: "with a build-up", "loopable", "intro + main"

## Pitfalls / Gotchas
- Music generation is non-deterministic — generate 3-4 variations and pick the best
- Longer tracks (> 60s) may lose coherence — loop shorter segments instead
- Some prompts are too vague — "make music" produces generic results
- Always check copyright implications if using commercially (generated music is original)
- Normalize after mixing — music + voice often clips

## Cross-links
- [music-acestep](../music-acestep/SKILL.md) — ACE-Step engine (lyrics, singing)
- [sfx-stable-audio](../sfx-stable-audio/SKILL.md) — Stable Audio (instrumental, SFX)
- [drum-machine](../drum-machine/SKILL.md) — Step-sequenced percussion
- [procedural-instruments](../procedural-instruments/SKILL.md) — Single-note synthesis
- [virtual-instruments-gm](../virtual-instruments-gm/SKILL.md) — General MIDI SoundFont
- [effects-tone](../effects-tone/SKILL.md) — EQ for music mixing
- [effects-dynamics](../effects-dynamics/SKILL.md) — Compression for music
- [mastering](../mastering/SKILL.md) — Final loudness/quality

## Validation
- Play the output and verify it matches the prompt intent
- Check loudness (should be -14 to -16 LUFS for music)
- For loops: verify seamless repeat (no click/gap at loop point)
