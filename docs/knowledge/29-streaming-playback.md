# 29 — Streaming Playback

PURPOSE: Real-time chunk-based TTS playback — play audio as soon as first chunk completes, don't wait for full assembly.
OWNS: SSE chunk delivery, sequential chunk queue, fetchChunkWithRetry, assembled audio switch.
READ-WHEN: You touch generation streaming, audio playback, or chunk delivery.
KEY-FILES: app/src/lib/hooks/useGenerationProgress.ts, backend/routes/generations.py, backend/services/generation.py, app/src/stores/playerStore.ts
INVARIANTS: First chunk auto-plays; subsequent chunks queue and play sequentially; assembled audio replaces queue on completion; 404 retry on slow disk writes.
GOTCHAS: Only the first chunk triggers auto-play; subsequent chunks are queued via onFinish callback chain. Agent/MCP sources skip auto-play.
UPDATED: 2026-08-21

## Agent Callable

| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Generate with streaming | `21labs.speak` | `POST /generate` (streaming=true) | `backend/services/generation.py` |
| Get chunk status | `21labs.generation_status` | `GET /generations/{id}/status` | `backend/routes/generations.py` |

## How It Works

### SSE Chunk Delivery
1. Frontend sends `POST /generate` with `streaming: true`
2. Backend starts generation and opens SSE connection to `GET /generations/{id}/status`
3. As each chunk completes, backend writes chunk file to disk and emits `chunk_ready` event
4. Frontend receives event, builds chunk URL, adds to queue
5. First chunk triggers `setAudioWithAutoPlay` — playback starts immediately
6. Subsequent chunks are queued and played sequentially via `onFinish` callback chain
7. When full generation completes, `completed` event fires
8. Frontend switches to assembled audio URL (better quality — crossfade applied)

### Chunk Queue Architecture
```
chunk_ready(index=0) → auto-play
chunk_ready(index=1) → queued
chunk_ready(index=2) → queued
completed            → switch to assembled audio
```

### fetchChunkWithRetry
Handles slow disk writes where Audio element may try to fetch before file is written:
- On 404: retry up to 3 times with exponential backoff (200ms, 400ms, 800ms)
- On non-404 error: skip (file exists but is corrupted)
- On network error: retry up to 2 times

### Agent Skip
When `source === 'agent'` or `source === 'mcp'`, auto-play is skipped — agents prefer to let the user control playback.

## Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `useGenerationProgress` | `app/src/lib/hooks/useGenerationProgress.ts` | SSE listener + chunk queue management |
| Generate submit | `app/src/features/generate/Composer.tsx` | Generation trigger with streaming flag |
| `playerStore` | `app/src/stores/playerStore.ts` | Audio playback state + setAudioWithAutoPlay |

## Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/generate` | POST | Start generation (streaming=true returns SSE) |
| `/generations/{id}/status` | GET | SSE stream for chunk_ready/completed events |
| `/generations/{id}/chunks/{index}` | GET | Fetch individual chunk file |

## Events

| Event | Payload | When |
|-------|---------|------|
| `chunk_ready` | `{chunk_index, chunk_url, chunk_total}` | Chunk written to disk |
| `completed` | `{audio_url, duration}` | Full generation assembled |
| `failed` | `{error}` | Generation failed |
| `cancelled` | `{}` | Generation cancelled |
