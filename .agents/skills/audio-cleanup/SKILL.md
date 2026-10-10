---
name: audio-cleanup
description: Repair noisy, distorted, or poorly recorded audio — noise reduction, de-essing, denoising, normalization, and restoration. Use when a user asks to "clean up audio", "remove noise", "fix this recording", "denoise", or "repair audio".
---
# Audio Cleanup

## Purpose
Restore and improve audio quality by removing noise, reducing sibilance, fixing levels, and applying transparent processing.

## When to use
- User has a noisy recording (background hum, fan noise, hiss)
- User needs to remove sibilance (harsh "s" sounds)
- User has a recording with bad levels (too quiet or clipping)
- User wants to clean up dialogue before mixing
- User needs to remove silence or dead air

## Prerequisites
- Audio file to process
- Effects chain available (pedalboard or numpy/scipy)

## Parameters / Schema
- **audio_path**: Path to the audio file
- **operations**: Which cleanup steps to apply
- **intensity**: How aggressive the processing should be (light/medium/heavy)

## Agent procedure

### 1. Diagnose the audio
Before processing, understand what's wrong:
```
MCP: 21labs.analyze_loudness(audio_path="input.wav")
MCP: 21labs.transcribe(audio_path="input.wav")
```
- Check LUFS (should be -14 to -24 for dialogue)
- Check if transcription is accurate (errors suggest noise issues)

### 2. Choose the cleanup pipeline

| Problem | Solution | Tool |
|---------|----------|------|
| Background noise/hum | Noise reduction | `21labs.noise_reduce` |
| Harsh sibilance | De-esser | `21labs.apply_effects` with a generation ID |
| Too quiet | Peak level adjustment | `21labs.normalize_audio` |
| Clipping | True-peak limiting/mastering | `21labs.master_audio` |
| Dead air/silence | Silence removal | `21labs.trim_silence` or `21labs.silence_removal` |
| muddy low end | High-pass filter | `21labs.apply_effects` with EQ |
| Room reverb | Denoise | `spectral_denoise` effect |

### 3. Apply noise reduction first
```
MCP: 21labs.noise_reduce(
  audio_path="input.wav"
)
```
The current backend uses DeepFilterNet; `vad_threshold` is accepted but inert. For stationary noise, prefer the `spectral_denoise` effect.

### 4. Apply de-esser if needed
```
MCP: 21labs.apply_effects(
  generation_id="<generation-id>",
  effects_chain=[{"type": "deesser", "enabled": true, "params": {"threshold_db": -18, "reduction_db": -6, "strength": 0.6}}]
)
```

### 5. Fix levels
```
MCP: 21labs.master_audio(
  audio_path="processed.wav",
  target_lufs=-16.0,
  true_peak_db=-1.0
)
```
`normalize_audio` adjusts peak level only; use `master_audio` or an export preset for LUFS delivery.

### 6. Verify
```
MCP: 21labs.analyze_loudness(audio_path="final.wav")
MCP: 21labs.transcribe(audio_path="final.wav")
```
- LUFS should be in target range
- Transcription should be accurate
- Listen for artifacts (over-processing sounds watery/metallic)

## Processing order
Always process in this order for best results:
1. **Noise reduction** (remove noise before other processing)
2. **De-esser** (before compression, which can amplify sibilance)
3. **EQ** (shape tone after noise removal)
4. **Compression** (control dynamics)
5. **Normalization** (final level adjustment)

## Pitfalls / Gotchas
- **Less is more** — aggressive processing creates artifacts (watery, metallic sound)
- **RNNoise needs training data** — it works best on speech, not music
- **Don't double-process** — running noise reduction twice degrades quality
- **Check before/after** — always compare the processed version to the original
- **Some noise is natural** — a completely silent background sounds robotic

## Cross-links
- [noise-reduction](../noise-reduction/SKILL.md) — DeepFilterNet behavior
- [effects-cleanup](../effects-cleanup/SKILL.md) — De-esser, spectral denoise, noise gate reference
- [effects-dynamics](../effects-dynamics/SKILL.md) — Compressor behavior
- [effects-tone](../effects-tone/SKILL.md) — EQ behavior
- [loudness-metering](../loudness-metering/SKILL.md) — LUFS measurement
- [mastering](../mastering/SKILL.md) — Final processing chain

## Validation
- Measure loudness before and after (should be within 3dB)
- Transcribe the cleaned audio (should match or improve on original)
- A/B test: listen to original vs cleaned side by side
- Check for artifacts: watery sound, clicks, phase issues
