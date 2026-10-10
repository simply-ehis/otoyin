# 22 — Platform Export

One-tap export presets for podcast, audiobook, movie, voiceover, and social media platforms.

## Route

`/workspace/export` — PlatformExportView

## Architecture

### Backend (`backend/routes/platform_export.py`)

- `GET /export/presets` — List all available export presets with format, LUFS target, and channel config.
- `POST /export/apply-preset` — Apply a preset to an audio file. Returns processed WAV blob.

### Frontend (`PlatformExportView.tsx`)

- Preset cards: Podcast, Audiobook, Movie Audio, Voiceover, Social Media
- Each card shows format, LUFS target, channel config, and description
- File selector for input audio
- Export button triggers download of processed audio

## Presets

| Preset | Format | LUFS | Channels |
|--------|--------|------|----------|
| Podcast | MP3 320kbps | -16 | Mono |
| Audiobook | FLAC | -18 | Stereo |
| Movie Audio | WAV 24-bit | -24 | 5.1 Surround |
| Voiceover | WAV 16-bit | -12 | Mono |
| Social Media | AAC 128kbps | -14 | Mono |

## Processing Chain

1. Read input audio
2. Apply format-specific processing (sample rate, bit depth, channel mapping)
3. Loudness normalization to target LUFS
4. Peak limiting to prevent clipping
5. Encode to target format
6. Return as downloadable blob

## Agent Callable
- **MCP Tools:** (none — platform export is UI-initiated)
- **REST Endpoints:** `GET /export/presets`, `POST /export/apply-preset`
- **Key Backend Files:** `backend/routes/platform_export.py`
- **Key Frontend Files:** `app/src/features/workspace/PlatformExportView.tsx`
