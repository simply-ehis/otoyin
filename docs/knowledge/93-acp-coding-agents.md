# 93 — ACP coding agents (in-app control)

**Status:** implemented 2026-11-16. Otoyin drives local coding agents from a
Settings page; the CLI runs invisibly, no separate window.

## Direction

Otoyin is the **ACP client**. It spawns the coding agent as a hidden child
process and speaks JSON-RPC 2.0 over that process's stdin/stdout. This is the
same protocol Zed/JetBrains use, but the "editor" here is Otoyin. The earlier
idea of a CLI-driven in-app agent is the mirror image and is deliberately not
implemented — the tool surface stays inside Otoyin's own assistant.

## Why ACP here

- **stdio, no socket**: the child owns a pipe, not a listening port. No new
  auth surface, no CORS, no exposed HTTP endpoint.
- **Streaming + cancel are first-class**: `session/update` frames and
  `session/cancel` map directly onto an SSE panel in the app.
- **Works with installed CLIs**: no new model or runtime is downloaded by
  Otoyin; it reuses the user's existing coding-agent login and config.

## Detection (`backend/services/coding_agents.py`)

The catalog is the **published ACP registry**, bundled as
`backend/services/acp_registry.json` (46 agents at last refresh; bundled by `build_binary.py`). Detection is a
pure filesystem/PATH check — no agent process is launched — so the Settings
page can call it on every render. Each registry entry carries its own
`distribution` metadata (`npx` / `uvx` / per-platform binary) with the exact
`cmd` + `args` for ACP mode, so no per-agent command table is maintained in
code.

- **Binary distributions** — look up `cmd`'s basename on PATH (strips `./`
  and `.cmd`/`.exe`), then use the registry's `args` verbatim. Covers
  `opencode acp`, `cursor-agent acp`, `kilo acp`, `kiro-cli acp`, `agy acp`,
  `kiro`, goose, harn, and every other binary-distributed agent.
- **npx/uvx distributions** — count as installed when the package is already
  in a global `node_modules` tree, then run through `npx -y <package> <args>`.
- **Aliases** — a small map for agents whose CLI name differs from their ACP
  package (`codex`→`codex-acp`, `claude`→`claude-acp`, `copilot`→
  `github-copilot-cli`) so an installed CLI is still connectable via its
  adapter. This is the *only* hardcoded name list; all argv still comes from
  the registry.
- **Custom agents** — any local ACP command can be registered in Settings;
  stored in `data/acp_custom_agents.json` and passed verbatim as argv. The
  session stores the resolved argv in `Conversation.acp_command`, so it
  survives restarts.
- **Refresh** — `POST /coding-agents/registry/refresh` re-fetches the
  published registry on demand. Core detection stays fully offline; this is
  an explicit opt-in update for newly listed harnesses.

Windows npm shims resolve to `.cmd` (Python's `PATHEXT`), not the `.ps1` that
PowerShell's `Get-Command` reports — `.ps1` cannot be passed to `Popen`.
`find_executable()` resolves `.cmd` first and only falls back to `.ps1`.

## Process + wire (`backend/services/acp_client.py`)

- `popen_hidden()` from `utils/hidden_subprocess.py` adds `CREATE_NO_WINDOW`
  on Windows, so no console flashes. `stderr` goes to `DEVNULL` because an
  unread stderr pipe would deadlock a chatty agent.
- A reader thread classifies each newline-delimited JSON message:
  - response → resolves a `Future` keyed by request id
  - agent request → `session/request_permission` auto-approved (configurable);
    anything else gets `-32601`
  - notification → `session/update` forwarded to the SSE sink
- Implemented methods: `initialize`, `session/new`, `session/load`,
  `session/prompt`, `session/cancel`. Filesystem and terminal capabilities
  are **not** advertised, so agents cannot ask Otoyin to run shells/read files.
- `close()` kills the process tree (`taskkill /T /F` on Windows) — agents
  commonly spawn grandchildren. `app.py` calls `close_all()` on shutdown.

## Session model (`backend/routes/coding_agents.py`)

One ACP session = one `Conversation` row (`agent_type="coding_agent"`), so
coding sessions share the assistant's history table and delete/reopen paths.
Added columns: `acp_session_id`, `acp_status`, `acp_cwd`, `acp_command`.

- `GET /coding-agents` → all registry agents + custom ones, installed first
- `POST /coding-agents/registry/refresh` → opt-in refresh of the registry snapshot
- `GET/POST/DELETE /coding-agents/custom` → custom ACP agents
- `POST /coding-agents/sessions` → spawn + `session/new`, persist the row (accepts an explicit `command` for custom agents)
- `POST /coding-agents/sessions/{id}/prompt` → SSE (`update` / `done` / `error`),
  persists user + assistant messages at turn end
- `GET /coding-agents/sessions` and `/{id}` → history + messages
- `POST /…/cancel`, `DELETE /…/{id}` → cancel turn / kill + delete

Reattachment: if the in-memory process died, a new one is spawned; the ACP
session is restored with `session/load` when the agent advertises
`loadSession`, otherwise a fresh ACP session is created (Otoyin's own persisted
messages remain the source of truth for what the user sees).

Default cwd is `<data-dir>/coding-agents`, keeping agent writes inside
Otoyin's own data directory. Users can pass any existing absolute directory.

## UI (`app/src/features/settings/CodingAgentsPage.tsx`)

Settings → AI & Integration → Coding Agents:

- **Connect coding agents** — detected CLIs with native/adapter badge and a
  Connect/Disconnect action (enabled ids stored locally in the browser).
- **New session** — pick a connected agent, optional title, start.
- **Session history** — status + date + agent, click to reload messages.
- **Chat** — streams `agent_message_chunk` into the reply; cancel/delete.

API client methods live in `lib/api/clientCodingAgents.ts`; SSE uses raw
`fetch` on `apiClient.getBaseUrl()` because it is not a request/response shape.

## Verified

- `opencode acp` driven end to end: initialize → session/new → session/prompt
  → `agent_message_chunk` → `end_turn`; both messages persisted.
- HTTP smoke: `GET /coding-agents`, `POST /sessions`, SSE prompt, `GET /{id}`,
  `GET /sessions` all 200/201.
- Tests: `test_coding_agents.py`, `test_acp_client.py` (fake ACP agent over
  in-memory pipes); Ruff clean; `tsc --noEmit` and Biome clean.

## Limits

- Codex/Claude adapters are detected but not smoke-tested here (no local
  login in this environment); OpenCode was the real target.
- Permission requests are auto-approved by default — appropriate for a
  local trusted CLI, but a future revision should surface them in the UI.
- The first-cut ACP surface is text-only prompts; images/audio are not sent.
