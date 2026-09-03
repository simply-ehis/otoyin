---
name: video-dubbing-detailed
description: End-to-end video dubbing workflow — transcribe, translate, re-voice, and mux a dubbed video. Use when a user asks to "dub this video", "translate video voiceover", or "replace speech in video".
---
# Video Dubbing (Detailed)

## Purpose
Replace the speech in a video with a target-language voiceover, preserving timing and quality.

## When to use
- User wants to dub a video into another language
- User needs to replace dialogue in a video
- User asks for "video voiceover" or "translate this video"

## Prerequisites
- Source video file (MP4, MOV, AVI)
- Target language code (e.g., "es", "fr", "de", "ja")
- At least one TTS engine with the target language supported

## Agent procedure

### 1. Check language support
```
MCP: 21labs.dub_languages()
```
Returns supported languages with engine coverage.

### 2. Start the dub job
```
MCP: 21labs.dub_video(
  video_path="input.mp4",
  target_language="es",
  voice_profile_id="optional-profile-uuid"
)
```
If no profile is specified, the system auto-selects a suitable voice for the target language.

### 3. Monitor progress
```
MCP: 21labs.dub_status(job_id="job-uuid")
```
Status values: `pending` → `transcribing` → `translating` → `rendering` → `muxing` → `completed`

### 4. Preview the result
```
MCP: 21labs.dub_preview(job_id="job-uuid")
```
Returns a low-quality preview for verification.

### 5. Download the final video
```
MCP: 21labs.dub_download(job_id="job-uuid")
```
Returns the path to the dubbed video file.

### 6. Cancel if needed
```
MCP: 21labs.dub_cancel(job_id="job-uuid")
```

## Pipeline details

```
Source Video → STT (Whisper) → Text → Translation (LLM) → TTS → Audio Track → Mux with Video
```

1. **Extract audio** from video (ffmpeg)
2. **Transcribe** with timestamps (Whisper)
3. **Translate** text to target language (local LLM or cloud)
4. **Generate speech** in target language (TTS engine)
5. **Align timing** to match original speech duration
6. **Mux** new audio track with original video (ffmpeg)

## Tips
- Provide a voice profile for consistent voice across videos
- Short videos (< 5 min) render faster
- Complex background audio may bleed into transcription
- Check the preview before downloading the final output

## Pitfalls / Gotchas
- Long renders are async — poll `dub_status`; never claim done before download succeeds
- Some TTS engines don't support all languages — check `dub_languages` first
- Background music may interfere with transcription quality
- Dubbed audio replaces the original audio track (original is preserved separately)

## Cross-links
- `stt-whisper` — Transcription engine reference
- `tts-kokoro` — Kokoro for multilingual TTS
- `tts-qwen` — Qwen for multilingual TTS
- `66-video-dubbing.md` — Video dubbing knowledge doc
- `platform-export` — Export presets for different platforms

## Validation
- Preview the dubbed video and check lip-sync timing
- Verify the translated text makes sense in context
- Check audio quality (no artifacts, natural prosody)
- Measure loudness (should be consistent with source)
