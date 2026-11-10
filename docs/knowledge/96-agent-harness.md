# 96 — Agent harness (in-app driver)

PURPOSE: Typed command registry so coding agents (Claude Code, etc.) and the in-app assistant can drive Otoyin directly through commands — "direct, not MCP" (design doc §9).
OWNS: app/src/lib/commandRegistry.ts, app/src/lib/assistantCommands.ts, app/src/layouts/RootLayout/RootLayout.tsx
READ-WHEN: touching agent commands, adding new commands the assistant can execute, or wiring the command harness
KEY-FILES: app/src/lib/commandRegistry.ts, app/src/lib/assistantCommands.ts, app/src/layouts/RootLayout/RootLayout.tsx
INVARIANTS: Every command is registered once with name, description, category, Zod input/output schemas, permissions, and handler. `execute()` validates input → runs handler → validates output. `getFunctionSchemas()` returns OpenAI-compatible function definitions for agent tool calling. `useAssistantCommands()` mounts once in RootLayout and listens for `assistant-command` DOM events. `theme`/settings state is NOT managed here — that's the settings schema (doc §5).
GOTCHAS: `useNavigate()` is a React hook and can't be called at module load time — `setNavigate()` wires it from `useAssistantCommands` into command handlers. Rust `cargo test` can't run (pre-existing taurin-cli/tauri.conf.json version mismatch). Backend `CLIENT_COMMAND_TOOLS` in `mappings.py` lists the same 8 client commands; REST endpoints remain available to MCP/API callers.
UPDATED: 2026-11-10

## Registered commands

| Command | Category | Description |
|---------|----------|-------------|
| `ui_navigate` | navigation | Navigate to a named view (`view` + optional `session`) |
| `ui_set_voice_profile` | profile | Select the active voice profile (`profile_id`) |
| `studio_add_track` | studio | Add a track to Audio Studio (`name`) |
| `studio_set_master_volume` | studio | Set master volume (`volume`) |
| `studio_import_session` | studio | Import an Audio Studio session (`session_id`) |
| `voice_changer_enable` | voice_changer | Enable/disable voice changer (`enabled`) |
| `voice_changer_set_profile` | voice_changer | Set voice changer profile (`profile`) |
| `voice_changer_set_preset` | voice_changer | Apply preset: telephone / deep / chipmunk (`preset`) |

## How the agent drives the app

1. The assistant stream emits SSE events of type `command` with `intent` and `tool_args`.
2. `assistantStreamEvents.applyStreamEvent()` routes `type === "command"` to `dispatchAssistantCommand(intent, args)`.
3. `dispatchAssistantCommand` emits an `assistant-command` DOM event.
4. `useAssistantCommands()` (mounted in RootLayout) listens and calls `executeAssistantCommand(intent, args)`.
5. `executeAssistantCommand` looks up the command in `commandRegistry`, validates args via Zod, runs the handler, validates output via Zod.
6. The agent discovers available commands via `getAvailableCommands()` (OpenAI function schemas) and calls them with ordinary function calling.

## Adding a new command

1. Register it in `commandRegistry` with name, description, category, Zod input/output schemas, permissions, and async handler.
2. The command is automatically available via `getAvailableCommands()` and `executeAssistantCommand()`.
3. No changes to `assistantCommands.ts` switch needed — the registry is the single source of truth.

## Tests

- `app/src/lib/commandRegistry.test.ts` — register/get/getAll/execute, validation errors, unknown command, metadata, function schemas, `toJsonSchema` (10 tests).
- `app/src/lib/assistantCommands.test.ts` — execute, unknown command, validation failure, function schemas, DOM event dispatch (8 tests).
