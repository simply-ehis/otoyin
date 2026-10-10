---
name: voice-clone-workflow
description: End-to-end voice cloning workflow — from reference audio selection through profile creation, quality verification, and production use. Use when a user wants to "clone a voice", "create a voice from audio", or "make a profile from this recording".
---
# Voice Clone Workflow

## Purpose
Guide the complete voice cloning process: selecting reference audio, creating a voice profile, verifying quality, and using the cloned voice in production.

## When to use
- User has reference audio and wants to clone that voice
- User wants to create a voice profile from a recording
- User asks "how do I clone a voice?"
- User needs to verify clone quality before production use

## Prerequisites
- At least one cloning-capable engine downloaded (`pocket_tts`, `qwen3_tts`, or `zonos_gguf` — verify with `21labs.list_models`)
- Reference audio file (WAV/MP3, 5-30 seconds recommended)

## Parameters / Schema
- **reference_audio**: Path or URL to the reference recording
- **reference_text**: What the reference audio says (optional but improves quality)
- **name**: Profile name
- **engine**: Which cloning engine to use

## Agent procedure

### 1. Assess the reference audio
Check quality before cloning:
```
MCP: 21labs.analyze_loudness(audio_path="reference.wav")
MCP: 21labs.transcribe(audio_base64="<b64 of reference.wav>", model="base.en", language="en")
```
`audio_path` is loopback-callers only; remote callers must use `audio_base64`.
- Loudness should be -20 to -6 LUFS (not too quiet, not clipping)
- Transcription should match what the speaker actually said
- Background noise degrades clone quality

### 2. Clean if needed
```
MCP: 21labs.noise_reduce(audio_path="reference.wav")
MCP: 21labs.normalize_audio(audio_path="reference_clean.wav", target_db=-14.0, max_peak_db=-3.0)
```

### 3. Choose the cloning engine

| Engine | Size | Quality | Speed | Languages |
|--------|------|---------|-------|-----------|
| pocket_tts | 200MB | Good | Fast | 6 |
| qwen3_tts | ~1.5GB | Excellent | Slow, one-shot | 10 |
| zonos_gguf | 2GB | Excellent | Slow | 5 |

**Recommendation**: Start with `pocket_tts`; use a preset voice first if a preset is acceptable. Escalate to `qwen3_tts`, then `zonos_gguf`.

### 4. Create the voice profile
```
MCP: 21labs.create_profile(
  name="My Cloned Voice",
  description="Clone of [person] from [source]",
  voice_type="cloned",
  default_engine="pocket_tts"
)
```

### 5. Upload reference audio to the profile
```
MCP: 21labs.add_profile_sample(
  profile_id="<new_profile_id>",
  sample_path="reference_clean.wav",
  reference_text="What the speaker said in the recording"
)
```

### 6. Verify quality
Generate a test phrase and listen:
```
MCP: 21labs.speak(
  profile="<new_profile_id>",
  text="This is a quality check for the cloned voice.",
  engine="pocket_tts"
)
```
Compare the output to the reference. Check for:
- Timbre match (does it sound like the same person?)
- Natural prosody (is the rhythm natural?)
- Artifacts (clicking, buzzing, phase issues)

### 7. Production use
Once verified, use the profile for any generation:
```
MCP: 21labs.speak(
  profile="<new_profile_id>",
  text="Your production text here",
  engine="pocket_tts"
)
```

## Pitfalls / Gotchas
- **Reference audio must be clean** — background music, noise, or other speakers degrade quality
- **5-30 seconds is ideal** — too short = poor quality, too long = diminishing returns
- **Match the language** — cloning works best when reference and target are the same language
- **Don't pitch-shift the reference** — some engines reject non-natural audio
- **Test before production** — always generate a quality check clip first

## Cross-links
- [voice-cloning](../voice-cloning/SKILL.md) — Engine comparison and fallback strategies
- [voice-profiles](../voice-profiles/SKILL.md) — Profile management reference
- [engine-atlas](../engine-atlas/SKILL.md) — Current engine capabilities
- [reference-voices](../reference-voices/SKILL.md) — Bundled reference voice clips

## Validation
- Transcribe the clone output and compare to input text (should match)
- Measure loudness of output (should be within 3dB of reference)
- Listen for artifacts (clicks, phase, robotic timbre)
