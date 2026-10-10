# 15 — MCP Integration

## Overview
- **What:** Model Context Protocol (MCP) tools allow external AI assistants (Claude, GPT, etc.) to control otoyin via stdio-based JSON-RPC.

## MCP Server
- **Where:** `backend/mcp_server/server.py` → `build_mcp_server()`
- **Name:** "otoyin MCP"
- **Transport:** Streamable HTTP at `/mcp` (one uvicorn process as the REST API, port 17493); stdio shim `otoyin-mcp` bridges non-HTTP clients.
- **Header:** `X-otoyin-Client-Id: coding-agent` (legacy `X-21labs-Client-Id` is still accepted).

## Available Tools

### 21labs.speak
- **What:** Generate speech from text using a voice profile.
- **Parameters:**
  - `text` (string, required): Text to speak
  - `profile_id` (string, optional): Voice profile ID
  - `engine` (string, optional): TTS engine override
  - `output_path` (string, optional): Where to save the audio file
- **Returns:** `{ audio_path: string, duration: float, engine: string }`

### 21labs.transcribe
- **What:** Transcribe an audio file to text using Whisper.
- **Parameters:**
  - `audio_path` (string, required): Path to audio file
  - `language` (string, optional): Language code
- **Returns:** `{ text: string, language: string, duration: float }`

### 21labs.list_captures
- **What:** List all captured audio recordings.
- **Parameters:** None
- **Returns:** Array of capture records with id, timestamp, duration, text

### 21labs.list_profiles
- **What:** List all voice profiles.
- **Parameters:** None
- **Returns:** Array of profile records with id, name, type, engine

## MCP Context
- **What:** ContextVar tracking the current MCP client session.
- **Where:** `backend/mcp_server/context.py`
- **Header constant:** `CLIENT_ID_HEADER = "X-21labs-Client-Id"`

## MCP Shim
- **What:** Bridges MCP stdio transport to the backend's HTTP MCP endpoint.
- **Where:** `backend/mcp_shim/__main__.py`
- **Behavior:** Reads JSON-RPC from stdin, forwards to backend HTTP (`http://127.0.0.1:17493/mcp/`), writes response to stdout
- **Repo launcher:** `bin/otoyin-mcp.mjs` resolves the target-suffixed binary in `tauri/src-tauri/binaries/` and is referenced by `.mcp.json` so coding agents can auto-discover it.

## Frontend MCP Page
- **What:** UI for configuring MCP server connection and viewing available tools.
- **Where:** `app/src/features/settings/MCPPage.tsx`

## Agent Callable
- **MCP Tools:** `21labs.speak`, `21labs.transcribe`, `21labs.list_captures`, `21labs.list_profiles`, `21labs.list_models`, `21labs.generate_sfx`, `21labs.generate_music`, `21labs.bounce`, `21labs.noise_reduce`, `21labs.normalize_audio`, `21labs.master_audio`, `21labs.separate_audio`, `21labs.run_recipe`, `21labs.plan_workflow`, `21labs.execute_plan`
- **REST Endpoints:** `GET /mcp/bindings`, `PUT /mcp/bindings`, `DELETE /mcp/bindings/{clientId}`, `GET /assistant/tool-parity`
- **Key Backend Files:** `backend/mcp_server/server.py`, `backend/mcp_server/context.py`, `backend/mcp_server/tools/` (all tool files), `backend/routes/mcp_bindings.py`, `backend/routes/assistant.py`
- **Key Frontend Files:** `app/src/features/settings/MCPPage.tsx`, `app/src/lib/hooks/useMCPBindings.ts`
## Unified Tool Registry

The tool registry () is the single source of truth for all MCP and assistant tools. It prevents drift between the two adapter layers.

- **Registry:**  —  dataclass +  singleton
- **Population:**  — scans ENDPOINT_MAP + MCP decorators
- **Startup verification:**  — calls  at boot

### How it works
1.  reads  and scans MCP tool files via regex
2.  inspects the live FastMCP instance
3.  cross-checks MCP surface vs assistant surface
4. Summary logged at startup: total tools, MCP count, assistant count, dual-surface count

### Adding a new tool
1. Add endpoint to  (ENDPOINT_MAP)
2. Add schema to  (TOOLS list)
3. Add MCP decorator in  (if MCP surface needed)
4. Registry auto-detects all three on next startup

### Key files
-  — ToolDef, ToolRegistry
-  — populate(), sync_from_mcp_server(), verify()
-  — 15 tests
