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
- At least one music engine available (ACE-Step, Stable Audio)
- Optional: SoundFont for GM instruments

## Parameters / Schema
- **prompt**: Natural language description of the music
- **duration**: Length in seconds (5-180)
- **tempo**: BPM (optional, some engines support it)
- **genre**: Style hint (optional)
- **format**: `loop` (seamless) or `track` (with intro/outro)

## Agent procedure

### 1. Determine the music type

| Request | Best engine | Why |
|---------|-------------|-----|
| Full song with lyrics | ACE-Step | Supports singing |
| Instrumental background | ACE-Step or Stable Audio | Both handle this well |
| Short loop/jingle | ACE-Step (loop mode) | Seamless looping |
| Drum pattern | Drum Machine | Step-sequenced percussion |
| Single instrument note | Procedural instruments | Piano, synth, drum hits |

### 2. Generate the music
```
MCP: 21labs.generate_music(
  prompt="upbeat corporate background music, positive, 120 BPM",
  duration=30
)
```

### 3. Post-process
```
MCP: 21labs.apply_effects(
  effects=[
    {"type": "eq", "params": {"low_freq": 80, "high_freq": 12000}},
    {"type": "compressor", "params": {"threshold": -18, "ratio": 3}}
  ]
)
```

### 4. Loop if needed
For background beds that need to repeat:
```
MCP: 21labs.splice_audio(files=["track.wav"], operation="loop", target_duration=180)
```

### 5. Mix with other elements
```
MCP: 21labs.splice_audio(
  files=["music.wav", "voiceover.wav"],
  operation="mix",
  offsets=[0, 2]
)
```

### 6. Master to target loudness
```
MCP: 21labs.normalize_audio(target_lufs=-16)
```

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
- `music-acestep` — ACE-Step engine (lyrics, singing)
- `sfx-stable-audio` — Stable Audio (instrumental, SFX)
- `drum-machine` — Step-sequenced percussion
- `procedural-instruments` — Single-note synthesis
- `virtual-instruments-gm` — General MIDI SoundFont
- `effects-tone` — EQ for music mixing
- `effects-dynamics` — Compression for music
- `mastering` — Final loudness/quality

## Validation
- Play the output and verify it matches the prompt intent
- Check loudness (should be -14 to -16 LUFS for music)
- For loops: verify seamless repeat (no click/gap at loop point)
