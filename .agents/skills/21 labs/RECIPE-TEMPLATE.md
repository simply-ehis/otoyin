# Recipe Template

Copy this file to add a new content type. Fill every section. Keep it deterministic: an agent should
be able to execute the chain without guessing.

```markdown
# Recipe: <name>

## Goal
<one sentence: what kind of audio this produces>

## Engine choice
- TTS: <engine> (why)
- STT (if needed): faster-whisper
- Music/SFX: <engine> (if needed)

## Voice
- Profile: <cloned vs preset, personality?>
- Per-speaker assignment: <how>

## Production path
1. <generate / ADR / conversation / stories step>
2. <effects chain: list effect_ids + params, in order>
3. <mixing: auto-duck, level-match, bus routing>
4. <mastering: call `master_audio(audio_path, target_lufs=<...>, true_peak_db=-1.0)` — see docs/knowledge/37-professional-finishing.md>

## Export
- Preset: <Podcast/Audiobook/Movie Audio/Voiceover/Social Media>
- LUFS target: <value>
- Channels / format: <mono/stereo/5.1, codec>

## Caveats
- <offline limits, engine fallback, length limits>
```
