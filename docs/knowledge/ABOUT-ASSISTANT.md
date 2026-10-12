# About: AI Assistant Panel

> **PURPOSE:** Reference for the AI Assistant — chat-based helper with tool access.
> **OWNS:** Assistant panel, chat interface, tool execution
> **READ-WHEN:** Working on assistant features, chat, tool execution
> **KEY-FILES:** `AssistantPanel.tsx`, `MarkdownBody.tsx`, `CodeBlock.tsx`, `AudioTransport.tsx`, `assistantWidth.ts`, `assistantTabs.ts`, `assistantStreamEvents.ts`, `useAssistantMessageActions.ts`, `settings/` (model/prompt/planner/tokens sections)
> **INVARIANTS:** Assistant uses LLM with MCP tool access; suggestions are predefined; panel width persists in `uiStore.assistantWidth` (clamped 360–960px, content floor keeps ≥560px for the main layout); chat edits/deletes/branches sync to the server (PATCH/DELETE `/memory/messages/…`, branch prunes after the anchor) so reload restores them
> **GOTCHAS:** Settings toggle shows/hides model & API config panel; markdown renders through lazy `react-markdown` + `remark-gfm` via `MarkdownBody` (block code detection lives in the `pre` override — react-markdown v10 has no `inline` prop)
> **UPDATED:** 2026-10-12

## Overview

The AI Assistant is a chat panel that can call MCP tools to interact with the otoyin backend. It provides suggested prompts for common actions.

## Controls

| Button | Action |
|---|---|
| Left-edge handle | Drag (or Arrow keys, Shift = 64px steps) to resize panel width; the rest of the layout reflows |
| Key icon | Toggle Model & API settings panel |
| X icon | Close assistant panel |
| Send icon | Send typed message (or press Enter) |
| Stop icon | Abort the running stream (keeps the partial reply, posts no error) |
| Hover buttons | Edit (inline textarea, Ctrl+Enter saves), Delete, Branch from here — all synced to the server |

## Rendering

Assistant messages render markdown through `MarkdownBody` (lazy `react-markdown` + `remark-gfm`): document typography via the prose component map, GFM tables in scrollable cards, and fenced code through `CodeBlock` (language label + copy button, Prism `vscDarkPlus` theme). Audio replies share one transport (`AudioTransport`). New messages fade in; the streaming tail shows an accent cursor. Rows are virtualized — every row div must keep `data-index` or the virtualizer silently falls back to estimated positions and growing bubbles overlap.

## Suggested Prompts

The assistant shows 6 predefined suggestion buttons for common actions:
- Open the ADR view for session S1
- Generate a cinematic music cue
- (and 4 more — content varies)

## How It Works

1. User types a message or clicks a suggestion
2. Message is sent to the configured LLM
3. LLM can call MCP tools to interact with the backend
4. Tool results are returned to the LLM for final response
5. Response is displayed in the chat

## MCP Tools Available

The assistant has access to all 111 MCP tools defined in `docs/knowledge/mcp-tools-extended.md`.

## Agent Callable
- **MCP Tools:** All 88 MCP tools are accessible via the assistant chat. Key tools: `21labs.speak`, `21labs.list_profiles`, `21labs.list_models`, `21labs.generate_sfx`, `21labs.generate_music`, `21labs.bounce`, `21labs.noise_reduce`, `21labs.normalize_audio`, `21labs.master_audio`, `21labs.separate_audio`, `21labs.run_recipe`, `21labs.plan_workflow`, `21labs.execute_plan`
- **REST Endpoints:** `POST /assistant/chat` (SSE streaming), `GET /assistant/models`, `GET /assistant/tool-parity`, `POST /assistant/validate-key`
- **Key Backend Files:** `backend/routes/assistant.py`, `backend/services/workflow.py`, `backend/mcp_server/tools/workflow.py`, `backend/services/llm.py`, `backend/services/memory.py`
- **Key Frontend Files:** `app/src/features/assistant/AssistantPanel.tsx`, `app/src/features/assistant/AssistantSettings.tsx` (shell over `settings/` sections), `app/src/features/assistant/AssistantMessage.tsx`, `app/src/features/assistant/MarkdownBody.tsx`, `app/src/features/assistant/CodeBlock.tsx`, `app/src/features/assistant/useAssistantMessageActions.ts`, `app/src/features/assistant/assistantStreamEvents.ts`, `app/src/features/voiceChat/VoiceChatOverlay.tsx`
