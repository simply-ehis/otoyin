# Otoyin — Professional Audio Production Guide

PURPOSE: Best practices, loudness standards, and recommended effects chains for common production scenarios.
OWNS: docs/AUDIO_PRODUCTION_GUIDE.md
READ-WHEN: Setting up a production chain, mastering for a platform, or building a recipe.
KEY-FILES: docs/knowledge/37-professional-finishing.md, docs/knowledge/40-loudness-and-subtitles.md, docs/knowledge/27-new-effects.md
INVARIANTS: All operations offline-first. Loudness targets follow ITU-R BS.1770-4 / EBU R128.
GOTCHAS: LUFS targets vary by platform — always confirm before mastering. True peak must never exceed 0 dBTP.
UPDATED: 2026-07-19

---

## 1. Loudness Standards

| Platform | Integrated LUFS | True Peak (dBTP) | Standard |
|---|---|---|---|
| YouTube | -14 | -1.0 | ITU-R BS.1770-4 |
| Spotify | -14 | -1.0 | ITU-R BS.1770-4 |
| TikTok / Reels | -14 | -1.0 | Platform recommendation |
| Podcast (general) | -16 | -1.0 | AES TD1004.1 |
| Apple Podcasts | -16 | -1.0 | Apple spec |
| Broadcast (EBU R128) | -23 | -1.0 | EBU R128 |
| Netflix / Film | -24 | -2.0 | Netflix delivery spec |
| Audiobook (ACX) | -18 to -23 | -3.0 | ACX requirements |

**How to measure:** Use `analyze_loudness` (assistant/MCP tool or `/audio/analyze-loudness` endpoint).
Returns: `integrated_lufs`, `true_peak_dbtp`, `rms_db`, `crest_factor_db`, `loudness_range_lu`.

**How to master:** Use `master_audio` with the target LUFS for your platform.

---

## 2. Effects Chains by Use Case

### Voiceover / Podcast Chain
Apply in this order:
1. **Noise Gate** — `threshold_db: -40, release_ms: 100` — removes room tone between words
2. **EQ** — high-pass at 80 Hz (remove rumble), slight presence boost at 3-5 kHz
3. **Compressor** — `threshold_db: -18, ratio: 3:1, attack_ms: 10, release_ms: 100`
4. **De-esser** — `threshold_db: -20, freq_low: 4000, freq_high: 8000` — tame sibilance
5. **Normalize** — target -3 dBFS peak (before final master)
6. **Master Audio** — target -16 LUFS for podcast, -14 for streaming

### Film Dialogue / ADR Chain
1. **Spectral De-noise** — `amount: 0.5-0.7` — remove production noise
2. **EQ** — match the acoustic space of the scene (cut lows for small room, boost lows for large)
3. **Compressor** — `threshold_db: -20, ratio: 2:1` — gentle, preserve dynamics
4. **Reverb** — convolution with matching room preset (bedroom, studio_booth, church)
5. **De-esser** — lighter than voiceover (`strength: 0.4`)
6. **Master Audio** — target -24 LUFS (film broadcast)

### Music Mastering Chain
1. **EQ** — corrective only (cut resonances, don't boost)
2. **Compressor** — `threshold_db: -12, ratio: 2:1, attack_ms: 30` — glue
3. **Stereo Width** — `width: 0.2-0.4` — gentle widening (negative narrows)
4. **True-Peak Limiter** — `ceiling_db: -1.0` — prevent clipping
5. **Normalize** — target -14 LUFS for streaming, -23 for broadcast
6. **Master Audio** — confirm integrated LUFS matches target

### Vocal Processing (Creative)
1. **Pitch Shift** — ±2-5 semitones for character voices
2. **Formant Shift** — change vocal character without pitch change
3. **Chorus** — `rate_hz: 1.5, depth: 0.3` — thicken
4. **Delay** — `time_ms: 120-300, feedback: 0.2-0.4` — slapback or ambient
5. **Reverb** — hall or plate for spaciousness
6. **Distortion** — light saturation for warmth (`drive: 0.1-0.3`)

### Sound Design / Foley Chain
1. **Time Stretch** — slow down for dramatic effect, speed up for comedy
2. **Pitch Shift** — extreme shifts for creature/monster sounds
3. **Bitcrush** — lo-fi digital degradation
4. **Tape Saturation** — warm analog feel
5. **Vocoder** — robotic/voice synthesis effects
6. **Reverb** — convolution with environmental preset

---

## 3. Recording Best Practices

### Microphone Setup
- Use a quiet room; run **Spectral De-noise** as a safety net
- Record at 44.1 kHz or 48 kHz; 16-bit minimum (24-bit preferred)
- Keep input levels at -12 to -6 dBFS peak (leave headroom)
- Use the **Noise Gate** with a light threshold to clean up between phrases

### ADR Recording
- Match the acoustic space of the original scene
- Use the guide track for timing reference
- Record 3-5 takes minimum; use **Comping** to assemble the best parts
- Apply reverb matching the scene's room before final mix

### Voice Cloning
- Provide 10-30 seconds of clean reference audio
- Reference should be single-speaker, minimal background noise
- Use **Voice Profiles** (14-voice-profiles.md) for consistent cloning across sessions
- Test clone quality with a short phrase before batch generation

---

## 4. Mix Architecture

### Track Layout Convention
| Track | Content | Pan | Level |
|---|---|---|---|
| 1 | Primary voice / dialogue | Center | 0 dB |
| 2 | Secondary voice / backup | Center or L/R | -3 to -6 dB |
| 3 | Music bed | Wide stereo | -12 to -18 dB under voice |
| 4 | Foley / SFX | Panned to match visual | -6 to -12 dB |
| 5 | Ambience / room tone | Wide stereo | -18 to -24 dB |

### Bus Routing
- **Bus A (Voice):** All dialogue tracks → bus compressor → master
- **Bus B (Music):** All music tracks → bus compressor → master
- **Bus C (FX):** All SFX/foley → master
- Use **Sidechain Duck** on Bus B keyed to Bus A (music ducks under voice)

### Submix Best Practices
- Group related tracks into submixes (e.g., all percussion, all synths)
- Apply shared effects (reverb, compression) at the submix level, not per-track
- Use **Bus Send Levels** to control how much of each submix reaches the master

---

## 5. Automation

### Volume Automation
- Draw volume curves for dynamic parts (whisper → shout transitions)
- Use **Automation Lanes** in Audio Studio for per-track volume/pan automation
- Key rule: automate before mastering, not after

### Pan Automation
- Animate panning for movement (e.g., character walking left to right)
- Keep dialogue centered; use pan for music/SFX placement
- Pan automation + binaural rendering = immersive headphone experience

---

## 6. Export Checklist

Before delivering a final file:
1. [ ] All tracks muted that should be muted
2. [ ] No clipping anywhere in the signal chain
3. [ ] Loudness measured with `analyze_loudness` — matches platform target
4. [ ] True peak ≤ -1.0 dBTP (or -2.0 for film)
5. [ ] Stereo format confirmed (mono, stereo, or binaural)
6. [ ] File format: WAV 24-bit for delivery, WAV 16-bit for compatibility
7. [ ] Subtitles exported if dialogue content (SRT or VTT)
8. [ ] Session saved / backed up

---

## 7. Recipe Templates

Otoyin's **Recipe Runner** supports reusable workflow templates. Each recipe is a JSON chain of tool calls.

### Minimal Podcast Recipe
```json
[
  {"tool": "run_generation", "args": {"text": "...", "engine": "kokoro"}},
  {"tool": "apply_effect", "args": {"effect": "compressor", "params": {"threshold_db": -18, "ratio": 3}}},
  {"tool": "apply_effect", "args": {"effect": "deesser"}},
  {"tool": "master_audio", "args": {"target_lufs": -16}},
  {"tool": "export_subtitles", "args": {"fmt": "srt"}}
]
```

### Film Dialogue ADR Recipe
```json
[
  {"tool": "separate_audio", "args": {"stem": "vocals"}},
  {"tool": "apply_effect", "args": {"effect": "spectral_denoise", "params": {"amount": 0.6}}},
  {"tool": "apply_effect", "args": {"effect": "reverb", "params": {"preset": "studio_booth"}}},
  {"tool": "master_audio", "args": {"target_lufs": -24, "true_peak_db": -2.0}}
]
```

---

## 8. Common Pitfalls

| Issue | Cause | Fix |
|---|---|---|
| Audio sounds thin | High-pass filter too aggressive | Lower cutoff to 60 Hz or remove |
| Dialogue sounds hollow | Too much reverb | Reduce wet_dry_mix, use shorter decay |
| Music overpowers voice | No sidechain ducking | Apply sidechain_duck on music bus keyed to voice |
| True peak clipping | Limiter ceiling too high | Set ceiling_db to -1.0 |
| Inconsistent loudness across episodes | Different mastering chains | Use same recipe + preset for all episodes |
| Voice clone sounds wrong | Reference audio too short/noisy | Provide 10-30s clean single-speaker audio |
| Sibilance not reduced | De-esser freq range misaligned | Adjust freq_low/freq_high to match speaker's sibilant range |
