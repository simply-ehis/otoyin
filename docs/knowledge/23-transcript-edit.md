# 23 — Transcript-Driven Editing

Edit audio by manipulating its transcript — delete words, rearrange phrases, click to set playhead.

## Route

`/workspace/transcript` — TranscriptEditView

## Architecture

### Backend (`backend/routes/transcript_edit.py`)

- `GET /transcript/words?generation_id=<id>` — Get word-level timestamps for a generation.
- `POST /transcript/delete-words` — Delete audio segments corresponding to selected words. Returns updated audio.
- `POST /transcript/click-to-playhead` — Convert a word index to a playhead position in milliseconds.

### Frontend (`TranscriptEditView.tsx`)

- Word-level transcript display with timestamps
- Click any word to jump playhead to that position
- Select words and delete them (audio is trimmed to match)
- Visual highlighting of selected/deleted words

## Data Model

```typescript
interface WordTimestamp {
  index: number;
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

interface DeleteWordsRequest {
  generation_id: string;
  word_indices: number[];
}
```

## Use Cases

- Remove filler words (um, uh, like) from generated speech
- Rearrange dialogue by deleting and re-recording sections
- Quick cleanup of TTS output without waveform editing

## Agent Callable
- **MCP Tools:** (none — transcript edit is UI-initiated)
- **REST Endpoints:** `GET /transcript/{generationId}/words`, `POST /transcript/{generationId}/click-word`
- **Key Backend Files:** `backend/routes/transcript_edit.py`
- **Key Frontend Files:** `app/src/features/workspace/TranscriptEditView.tsx`, `app/src/features/workspace/LiveTranscriptView.tsx`
