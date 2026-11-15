# Assistant + Agent Surfaces

PURPOSE: How otoyin's AI assistant works — local GGUF planner (llama.cpp server) + OpenAI-compatible cloud LLMs, tool-calling, and the unified agent manifest.
OWNS: routes/assistant.py (chat endpoints), routes/assistant_stream.py (stream_api/stream_local), routes/assistant_tools/ (TOOLS + execute_tool), agents/manifest.py (canonical prompt + parity report).
READ-WHEN: Touching the chat assistant, tool execution, agent prompt, or MCP-vs-assistant tool parity.
KEY-FILES: routes/assistant.py, routes/assistant_stream.py, agents/manifest.py, routes/assistant_tools/execution.py
INVARIANTS: agents/manifest.py is the SINGLE SOURCE of truth for the system prompt + canonical tool schema. Both surfaces (in-app assistant, MCP) derive from it. execute_tool validates args before dispatch (audit-fixed 2026-07-19).
GOTCHAS: In-app assistant and MCP have DIFFERENT backends (assistant → REST endpoints; MCP → base64 WAV). Local GGUF path has no native function calling, so the tool schema is appended as text and the model emits raw JSON the stream parser decodes. The planner models are thinking models: chain-of-thought lands in `reasoning_content`, final answer in `content` — empty `content` + `finish_reason: length` means the token budget was spent thinking.
UPDATED: 2026-08-17

## Two LLM paths (routes/assistant.py)
- **Local** (`stream_local`): on-device GGUF planner via llama.cpp server.exe (`backend/backends/gguf_server_backend.py`, engine `gguf_llm`; default `model_id` `2.6B-Q4_0` — LiquidAI LFM2.5-2.6B, see `backend/backends/configs/llm.py`). No native function calling → system prompt includes a compact tool catalog (manifest.get_agent_system_prompt(with_tools=True) ⇒ base + build_local_tool_prompt). Model emits tool calls as raw JSON; assistant_stream parses it.
- **Cloud** (`stream_api`): any OpenAI-compatible endpoint (OpenAI/Anthropic/Groq/Together/OpenRouter/custom). Native function calling via `tools=TOOLS`. `api_key`/`api_base_url` passed per-request.

## Streaming + tool loop (routes/assistant_stream.py)
- `stream_api`(cloud): posts messages+tools, reads SSE, accumulates assistant text, decodes `tool_calls`. For each tool call: emits `tool_call` SSE, dispatches via `execute_tool(name, args, base_url)`, emits `tool_result`, appends to messages, loops (max tool-call iterations → "Reached maximum tool call iterations.").
- `stream_local`: same loop but the model's tool_call JSON is parsed from the accumulated text (no structured API). Same `execute_tool` dispatch.
- `base_url` comes from `request.base_url` (NOT a hardcoded port) — backend calls its own REST endpoints (per TOOL-REFERENCE GOTCHAS).

## execute_tool guard (audit-fixed 2026-07-19)
- `_validate_args` enforces schema `required` args (rejects missing with clear message instead of building a malformed URL) and sanitizes path args (rejects absolute/`..`/scheme://, normalizes relative). See docs/knowledge/TOOL-REFERENCE.md "Tool argument validation".

## Agent manifest (agents/manifest.py) — single source of truth
- `_base_prompt()` = the crafted `AGENT_INSTRUCTIONS` in `backend/agents/instructions.py` (persona + behavior + tool policy + output style + safety). Both surfaces share it; the tool catalog is appended per surface, not sliced from a doc.
- `get_canonical_tools()` → `assistant_tools.TOOLS` (111 tools). `CANONICAL_TOOL_NAMES` derived from it.
- `get_tool_parity_report()` — observable divergence between assistant (bare snake_case) and MCP (dotted `21labs.` names). `_collect_mcp_tool_names()` scans `mcp_server/tools/` for `@mcp.tool` decorators (regex, no server import side effects).
- `MCP_NAME_PREFIX = "21labs."`; `_normalize_stem` strips prefixes so names compare 1:1.

## Chat persistence (routes/memory.py, services/memory.py)
- History is append-only; `get_history` exposes server message `id`s so the chat UI can target mutations. Edit = `PATCH /memory/messages/{id}` (content replace); delete = `DELETE /memory/messages/{id}`; branch = `DELETE /memory/conversations/{cid}/messages/after/{mid}` (prunes everything created after the anchor, keeps counts consistent).
- Voice chat loads the same history but strips the UI `id` key before passing messages to the LLM.

## Observations (audit findings — for later judgement, NO code change yet)
1. **Tool parity is tracked but NOT enforced at runtime**: `get_tool_parity_report` is informational; nothing fails if a canonical tool has no MCP counterpart or vice versa. The docstring admits ADR/studio/spatial are assistant-only, RVC-packs/Freesound are MCP-only. A user on MCP cannot do ADR; a user on the assistant cannot pull RVC packs. Intentional for now, but the gap is invisible to end users.
2. **Local LFM tool-call JSON parsing is fragile** (assistant_stream.py:55-80): `json.loads(full_text)` on the whole accumulated text; if the model emits surrounding prose or a partial JSON, it falls back to emitting the text as a message (no tool call). No retry/repair of malformed tool JSON. Acceptable for a local model but can silently drop a tool call the user expected.
3. **`base_url` is the server's own URL** — if the assistant is reached via a reverse proxy / different host, `request.base_url` may not be the address the backend's own REST endpoints are actually bound to (Tauri IPC vs localhost). Could cause tool calls to hit the wrong host. Low risk in the standard Tauri localhost setup.
4. **Cloud `api_key` is passed per-request and logged nowhere** (good — no secret leak in execute_tool), but `validate_api_key` (assistant.py:82) does a live `GET {base}/models` with the key to test it; the key transits the backend. Fine for same-machine, but the key briefly exists in the request handler. BYOK design per 50-byok-model-providers.md encrypts at rest separately.
5. **Max tool-call iteration cap is a fixed loop limit** (assistant_stream.py) — a chatty tool that re-invokes itself could burn many iterations; the cap stops it but each iteration is a real backend HTTP call (rate-limited only on the TTS domain, not on general REST). Potential for a tool-call storm if the model misbehaves. Consider a global tool-call rate cap.
6. **`get_canonical_tools` imports `assistant_tools.TOOLS` at call time** (manifest.py:44) — good (avoids circular import at module load), but means the parity report depends on the assistant_tools package being importable; if it fails, `CANONICAL_TOOL_NAMES` is empty and the report shows 0 canonical tools (misleading, not fatal).

## Agent Callable
- **MCP Tools:** `21labs.plan_workflow`, `21labs.execute_plan`, `21labs.plan_templates`, `21labs.app_help`
- **REST Endpoints:** `POST /assistant/chat` (SSE streaming), `GET /assistant/models`, `GET /assistant/tool-parity`, `POST /assistant/validate-key`
- **Key Backend Files:** `backend/routes/assistant.py`, `backend/services/workflow.py`, `backend/mcp_server/tools/workflow.py`, `backend/services/llm.py`
- **Key Frontend Files:** `app/src/features/assistant/AssistantPanel.tsx`, `app/src/features/assistant/AssistantSettings.tsx`, `app/src/features/voiceChat/VoiceChatOverlay.tsx`
