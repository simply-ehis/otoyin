# Quick Start Guide

> **PURPOSE** — Get up and running with otoyin in under 5 minutes.
> **OWNS** — The getting-started experience.
> **READ-WHEN** — First time using the app, or helping someone new.

## 1. Start the server

```bash
# From the project root
just dev          # starts both backend + frontend
# OR
just dev-backend  # backend only (http://localhost:8000)
```

The backend serves the API at `http://localhost:8000`. The frontend (Tauri) connects automatically.

## 2. Download a model

Before generating speech, you need at least one TTS model:

1. Open **Settings → Models** (or click the download prompt)
2. Pick a model — recommended starting points:
   - **Kokoro-82M** — fastest, 50 voices, great quality for English
   - **Chatterbox Turbo** — fast, supports emotional tags like `[laugh]`
   - **Qwen3-TTS 1.7B** — best quality, multilingual, needs more RAM
3. Click **Download** and wait for it to finish

## 3. Create a voice profile

1. Go to the **Voices** tab
2. Click **New Profile**
3. Choose a type:
   - **Preset** — select from engine-specific voices (quickest)
   - **Cloned** — upload or record reference audio for voice cloning
4. Name it and save

## 4. Generate speech

1. Go to the **Generate** tab
2. Select your voice profile
3. Type or paste text
4. Click **Generate**
5. The audio appears in your generation history — click to play

## 5. Edit and mix

1. Click any generation → **Send to Audio Studio**
2. In Audio Studio, you can:
   - Trim, split, and reorder clips
   - Apply effects (reverb, EQ, compression)
   - Add music or sound effects on separate tracks
   - Adjust volume, pan, and automation

## 6. Export

1. Click **Export** in Audio Studio (or go to **Workspace → Platform Export**)
2. Choose a platform preset (Spotify, YouTube, podcast, etc.)
3. Click **Export** — the file downloads to your machine

## Key concepts

| Concept | What it is |
|---------|-----------|
| **Voice Profile** | A named voice (preset or cloned) used for TTS |
| **Generation** | A single TTS output from text + voice |
| **Capture** | Recorded audio from your microphone |
| **Story** | A timeline of clips for long-form composition |
| **Audio Studio** | Multi-track editor for mixing and effects |
| **Effects Chain** | Per-clip signal processing (EQ, reverb, etc.) |
| **Batch** | Generate many clips from a list of text items |
| **Recipe** | A preset production workflow (podcast, audiobook, etc.) |

## Common first tasks

| Task | Where to go |
|------|-------------|
| Generate a voiceover | Generate tab → type text → select voice → Generate |
| Record my voice | Captures tab → Record |
| Clone a voice | Voices tab → New Profile → Cloned → upload audio |
| Mix a podcast | Stories tab → add clips → Audio Studio → mix |
| Dub a video | Workspace → Video Dubbing → upload video → pick language |
| Transcribe audio | Captures tab → select clip → Transcribe |

## Troubleshooting

- **"Server initializing" banner** — Wait 10-30 seconds for models to load
- **No voices available** — Download a TTS model first (Settings → Models)
- **Generation fails** — Check the toast message; usually a missing model or invalid text
- **Audio sounds bad** — Try a different voice, or add effects in Audio Studio
- **App is slow** — Unload unused models in Settings → Models to free RAM
