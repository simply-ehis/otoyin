---
name: transcription-subtitles
description: Transcribe audio to text with speaker diarization and export as SRT/VTT subtitles. Use when a user asks to "transcribe this", "make subtitles", "add captions", or "get speaker labels".
---
# Transcription & Subtitles

## Purpose
Convert speech to text with optional speaker diarization, and export as timed subtitle files (SRT, VTT).

## When to use
- User wants to transcribe audio to text
- User needs subtitles for a video
- User wants speaker-labeled transcripts
- User needs captions for accessibility

## Prerequisites
- Audio or video file with speech
- Whisper model downloaded (Settings → Models)

## Agent procedure

### 1. Transcribe the audio
```
MCP: 21labs.transcribe(
  audio_path="recording.wav",
  language="en",
  model_size="base"
)
```

Model sizes:
| Size | Speed | Accuracy | RAM |
|------|-------|----------|-----|
| tiny | Fastest | Basic | ~1GB |
| base | Fast | Good | ~1GB |
| small | Medium | Better | ~2GB |
| medium | Slow | Great | ~5GB |
| large | Slowest | Best | ~10GB |

### 2. Optional: diarize speakers
```
MCP: 21labs.diarize(
  audio_path="recording.wav",
  num_speakers=3
)
```
Returns segments with speaker labels (SPEAKER_00, SPEAKER_01, etc.).

### 3. Export as subtitles
```
MCP: 21labs.export_subtitles(
  transcription_id="transcription-uuid",
  format="srt",
  max_chars_per_line=42
)
```

Formats:
- **SRT** — universal subtitle format (works with most players)
- **VTT** — WebVTT, preferred for web players

### 4. Alternative: capture flow (in-app)
For recordings made in otoyin, use the Captures tab:
1. Open Captures tab
2. Select a recording
3. Click **Transcribe**
4. View the transcript with timestamps

## Subtitle formatting tips

- **Max 42 characters per line** — standard for readability
- **Max 2 lines per subtitle** — don't stack more
- **Min duration 1 second** — don't flash subtitles too fast
- **Max duration 7 seconds** — split long passages
- **Speaker labels** — format as `[Speaker Name]: text` or use separate subtitle tracks

## Pitfalls / Gotchas
- Accuracy depends on audio quality — clean audio first if noisy
- Non-English audio needs a multilingual model (small or larger)
- Speaker diarization works best with 2-5 speakers
- Timestamps come from the STT model — don't fabricate them
- Very long audio (> 1 hour) should be chunked for reliability

## Cross-links
- `32-stt-backends.md` — STT model registry
- `stt-whisper` — Whisper engine reference
- `40-loudness-and-subtitles.md` — Subtitle export details
- `ABOUT-CAPTURES.md` — Captures tab overview

## Validation
- Transcription matches the audio content (spot-check 3-5 segments)
- Speaker labels are consistent (same person = same label)
- SRT/VTT is valid (no overlapping timestamps)
- Subtitles sync with audio (check start/end times)
