# REST API Reference

> **PURPOSE** — Complete reference for otoyin's REST API (for external integrators and automation).
> **OWNS** — The HTTP API surface.
> **READ-WHEN** — Building external integrations, scripting against otoyin, or debugging API calls.

## Base URL

```
http://localhost:8000
```

## Authentication

No authentication by default (local-only app). All endpoints are open on localhost.

## Health & Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (always 200 if server is up) |
| GET | `/health/ready` | Readiness check (200 = ready, 503 = initializing/failed) |

## Voice Profiles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profiles` | List all voice profiles |
| POST | `/profiles` | Create a new voice profile |
| GET | `/profiles/{id}` | Get a single profile |
| PUT | `/profiles/{id}` | Update a profile |
| DELETE | `/profiles/{id}` | Delete a profile |
| POST | `/profiles/{id}/samples` | Upload a reference audio sample |
| GET | `/profiles/{id}/samples` | List samples for a profile |
| DELETE | `/profiles/{id}/samples/{sample_id}` | Delete a sample |

## TTS Generation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/generate` | Generate speech from text |
| GET | `/generations` | List generation history |
| GET | `/generations/{id}` | Get a single generation |
| DELETE | `/generations/{id}` | Delete a generation |
| POST | `/generations/{id}/regenerate` | Re-run a generation with same params |

### POST /generate

```json
{
  "text": "Hello world",
  "profile_id": "uuid-of-voice-profile",
  "engine": "kokoro",
  "model": null
}
```

Response: generation object with `id`, `audio_path`, `status`.

## Captures (Recordings)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/captures` | List all captures |
| POST | `/captures` | Upload a capture (multipart/form-data) |
| GET | `/captures/{id}` | Get a single capture |
| DELETE | `/captures/{id}` | Delete a capture |

## Transcription

| Method | Path | Description |
|--------|------|-------------|
| POST | `/transcribe` | Transcribe audio to text |
| POST | `/transcription/export-subtitles` | Export as SRT/VTT |

## Audio Effects

| Method | Path | Description |
|--------|------|-------------|
| POST | `/effects/apply` | Apply effects chain to audio |
| POST | `/effects/normalize` | Normalize loudness |
| POST | `/effects/noise-reduce` | Reduce background noise |

## Stories (Timeline)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stories` | List all stories |
| POST | `/stories` | Create a new story |
| GET | `/stories/{id}` | Get story with items |
| PUT | `/stories/{id}` | Update story metadata |
| DELETE | `/stories/{id}` | Delete a story |
| POST | `/stories/{id}/items` | Add an item to the story |
| PUT | `/stories/{id}/items/{item_id}` | Update an item |
| DELETE | `/stories/{id}/items/{item_id}` | Remove an item |
| POST | `/stories/{id}/items/{item_id}/split` | Split an item at a time offset |
| POST | `/stories/{id}/items/{item_id}/duplicate` | Duplicate an item |

## Audio Studio

| Method | Path | Description |
|--------|------|-------------|
| POST | `/audio/bounce` | Mix/bounce tracks to a single file |
| POST | `/audio/bounce-preview` | Quick preview of bounce |
| POST | `/audio-studio/sessions` | Create an Audio Studio session |
| GET | `/audio-studio/sessions` | List sessions |
| GET | `/audio-studio/sessions/{id}` | Get a session |
| POST | `/audio-studio/sessions/{id}/export-reaper` | Export as Reaper project |

## Custom Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills` | List custom skills |
| POST | `/skills` | Create a custom skill |
| GET | `/skills/{skill_id}` | Get a custom skill |
| PUT | `/skills/{skill_id}` | Update a custom skill |
| DELETE | `/skills/{skill_id}` | Delete a custom skill |

## Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models/status` | List all models and their status |
| POST | `/models/{name}/download` | Download a model |
| POST | `/models/{name}/unload` | Unload a model from RAM |

## Export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/export/presets` | List platform export presets |
| POST | `/export/apply-preset` | Apply a preset to audio |

## Batch

| Method | Path | Description |
|--------|------|-------------|
| POST | `/batch/jobs` | Create a batch job |
| GET | `/batch/jobs/{id}` | Get batch job status |
| POST | `/batch/jobs/{id}/retry` | Retry failed items |
| DELETE | `/batch/jobs/{id}` | Cancel a batch job |

## Error Response Format

All errors return:

```json
{
  "detail": "Human-readable error message"
}
```

Status codes: 400 (bad request), 404 (not found), 409 (conflict), 500 (server error), 503 (not ready).

## Example: Generate + Export

```bash
# 1. List profiles
curl http://localhost:8000/profiles | jq '.[0].id'

# 2. Generate speech
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","profile_id":"PROFILE_ID","engine":"kokoro"}'

# 3. Export with preset
curl -X POST http://localhost:8000/export/apply-preset \
  -H "Content-Type: application/json" \
  -d '{"audio_path":"GENERATED_PATH","preset":"spotify"}'
```
