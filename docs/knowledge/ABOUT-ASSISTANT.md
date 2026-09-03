# About: AI Assistant Panel

> **PURPOSE:** Reference for the AI Assistant — chat-based helper with tool access.
> **OWNS:** Assistant panel, chat interface, tool execution
> **READ-WHEN:** Working on assistant features, chat, tool execution
> **KEY-FILES:** `AssistantPanel.tsx`
> **INVARIANTS:** Assistant uses LLM with MCP tool access; suggestions are predefined
> **GOTCHAS:** Settings toggle shows/hides model & API config panel
> **UPDATED:** 2026-08-07

## Overview

The AI Assistant is a chat panel that can call MCP tools to interact with the otoyin backend. It provides suggested prompts for common actions.

## Controls

| Button | Action |
|---|---|
| Key icon | Toggle Model & API settings panel |
| X icon | Close assistant panel |
| Send icon | Send typed message (or press Enter) |

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
- **Key Frontend Files:** `app/src/components/Assistant/AssistantPanel.tsx`, `app/src/components/Assistant/AssistantSettings.tsx`, `app/src/components/Assistant/AssistantMessage.tsx`, `app/src/components/VoiceChat/VoiceChatOverlay.tsx`
