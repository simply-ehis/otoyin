PURPOSE: Single source of truth for the otoyin agent surface — the shared system prompt, the canonical tool schema list, and an observable tool-parity report across the in-app assistant and the external MCP server.

OWNS: `backend/agents/manifest.py` (canonical prompt + `CANONICAL_TOOLS` + parity report), `backend/routes/assistant.py` (uses manifest prompt), `backend/mcp_server/server.py` (uses manifest MCP instructions), `backend/routes/assistant_tools/` (owns `TOOLS`/`execute_tool`), `backend/mcp_server/tools/` (owns MCP tool implementations).

READ-WHEN: You add/change a tool, the agent system prompt, or MCP instructions; or you need to know which capabilities each agent surface exposes.

KEY-FILES: `docs/knowledge/TOOL-REFERENCE.md` (human-readable tool catalog, base of the prompt), `39-instruments.md`, `00-index.md`.

INVARIANTS:
- The assistant system prompt and the MCP `instructions` both derive from `manifest.get_agent_system_prompt` / `get_mcp_instructions` — edit the manifest, not the call sites.
- `CANONICAL_TOOLS` (in `assistant_tools.TOOLS`) is the canonical OpenAI-style schema list; both surfaces should describe capabilities from it.
- Local llama.cpp has no native function calling, so `get_agent_system_prompt(with_tools=True)` appends a compact tool catalog + JSON output format.

GOTCHAS:
- Implementations still DIVERGE: assistant calls REST endpoints; MCP returns base64 WAV and has a few capabilities the assistant lacks (RVC voice packs/convert, Freesound, spatial presets, richer `bounce`). The assistant has capabilities MCP lacks (ADR, studio, spatial binaural/doppler, apply/export effects, analyze_pitch, UI/client-command tools). `GET /assistant/tool-parity` exposes this gap — closing it is tracked separately, not done here.
- MCP tool names are dotted (`21labs.speak`); assistant uses bare snake_case stems. The manifest normalizes both for the parity report.

## Endpoints
- `GET /assistant/tool-parity` → `{canonical_tool_count, mcp_tool_count, missing_in_mcp[], missing_in_assistant[]}`.

UPDATED: 2026-07-17
