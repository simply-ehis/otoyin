# 21 — Conversation Mode

Multi-speaker conversation, podcast, and debate mode with timed line delivery.

## Route

`/workspace/conversation` — ConversationView

## Architecture

### Backend (`backend/routes/conversation.py`)

- `POST /conversation/render` — **NOT IMPLEMENTED.** Do not call this route; it does not exist in `backend/routes/conversation.py` and there is no MCP `conversation/render` tool. Multi-speaker mixing/timing is achieved via `run_recipe` (crossfades speakers + ducks any music bed + masters), optionally after `auto-duck`/`auto-level`.
- `POST /conversation/auto-duck` — Compute auto-ducking gain envelope so background speakers duck when the primary speaker talks.
- `POST /conversation/auto-level` — Level-match all speakers to a target LUFS so no single voice dominates. (Route is `auto-level`, NOT `level-match`.)

### Frontend (`ConversationView.tsx`)

- Speaker list with color-coded badges and voice profile assignment
- Line editor with start time, text, and effects per line
- Render: the UI builds the mixed episode via `run_recipe` (the documented `POST /conversation/render` is not implemented).
- Auto-duck and level-match utility buttons
- Timeline grid showing line positions

## Data Model

```typescript
interface ConversationLine {
  speaker_id: string;
  text: string;
  voice_profile_id: string;
  start_ms: number;
  effects_chain?: EffectConfig[];
}

interface ConversationRequest {
  lines: ConversationLine[];
  sample_rate?: number;
  output_format?: string;
}
```

## Use Cases

- Podcast generation with multiple AI hosts
- Debate mode between two voices
- Audiobook narration with character voices
- Interview simulation

## Agent Callable
- **MCP Tools:** `21labs.list_conversation_presets`, `21labs.conversation_auto_duck`, `21labs.conversation_auto_level`, `21labs.run_recipe`
- **REST Endpoints:** `GET /conversation/presets`, `POST /conversation/auto-duck`, `POST /conversation/auto-level`
- **Key Backend Files:** `backend/routes/conversation.py`, `backend/services/recipe_runner.py`
- **Key Frontend Files:** `app/src/features/workspace/ConversationView.tsx`
