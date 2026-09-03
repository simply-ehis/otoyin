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
- At least one cloning-capable engine downloaded (Chatterbox, Fish Speech, Qwen3-TTS, or Seed-VC)
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
MCP: 21labs.transcribe(audio_path="reference.wav")
```
- Loudness should be -20 to -6 LUFS (not too quiet, not clipping)
- Transcription should match what the speaker actually said
- Background noise degrades clone quality

### 2. Clean if needed
```
MCP: 21labs.noise_reduce(audio_path="reference.wav")
MCP: 21labs.normalize_audio(audio_path="reference_clean.wav", target_lufs=-14)
```

### 3. Choose the cloning engine

| Engine | Size | Quality | Speed | Languages |
|--------|------|---------|-------|-----------|
| Chatterbox | 1.2GB | Excellent | Medium | ~20 |
| Fish Speech S1-mini | 500MB | Very good | Fast | 13 |
| Qwen3-TTS 1.7B | 1.7GB | Excellent | Slow | 10 |
| Seed-VC | 400MB | Good | Fast | Multi |
| LuxTTS | 300MB | Good | Very fast | English |

**Recommendation**: Start with Chatterbox (best quality/size ratio).

### 4. Create the voice profile
```
MCP: 21labs.create_profile(
  name="My Cloned Voice",
  description="Clone of [person] from [source]",
  voice_type="cloned",
  default_engine="chatterbox"
)
```

### 5. Upload reference audio to the profile
```
MCP: 21labs.clone_voice(
  profile_id="<new_profile_id>",
  audio_path="reference_clean.wav",
  reference_text="What the speaker said in the recording"
)
```

### 6. Verify quality
Generate a test phrase and listen:
```
MCP: 21labs.speak(
  profile_id="<new_profile_id>",
  text="This is a quality check for the cloned voice.",
  engine="chatterbox"
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
  profile_id="<new_profile_id>",
  text="Your production text here",
  engine="chatterbox"
)
```

## Pitfalls / Gotchas
- **Reference audio must be clean** — background music, noise, or other speakers degrade quality
- **5-30 seconds is ideal** — too short = poor quality, too long = diminishing returns
- **Match the language** — cloning works best when reference and target are the same language
- **Don't pitch-shift the reference** — some engines reject non-natural audio
- **Test before production** — always generate a quality check clip first

## Cross-links
- `voice-cloning` — Engine comparison and fallback strategies
- `voice-profiles` — Profile management reference
- `tts-chatterbox` — Chatterbox engine details
- `tts-fish-speech` — Fish Speech engine details
- `tts-qwen` — Qwen3-TTS engine details
- `reference-voices` — Bundled reference voice clips

## Validation
- Transcribe the clone output and compare to input text (should match)
- Measure loudness of output (should be within 3dB of reference)
- Listen for artifacts (clicks, phase, robotic timbre)
