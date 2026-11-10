# Worksheet — Finish Agent Driver (§9)

PURPOSE: Complete the in-app agent driver so coding agents/OpenCode can drive Otoyin through the command registry.
KEY-FILES: app/src/lib/commandRegistry.ts, app/src/lib/assistantCommands.ts, app/src/lib/api/clientSpatial.ts, app/src/features/assistant/useAssistantChat.ts, app/src/features/assistant/assistantStreamEvents.ts
INVARIANTS: Command schemas reach the LLM; tool calls execute client-side; results flow back to LLM. All 8 existing commands continue to work.
UPDATED: 2026-11-11

## Steps
1. [ ] Modify clientSpatial.ts `assistantChat` to accept tool schemas (boolean | CommandFunctionSchema[])
2. [ ] Modify useAssistantChat.ts to pass getAvailableCommands() schemas to assistantChat
3. [ ] Modify assistantStreamEvents.ts to execute tool_call events via executeAssistantCommand and emit tool_result
4. [ ] Tests: agent driver integration test (schema → execute → result round-trip)
5. [ ] Gate: 11/11 pass

## Verification
- typecheck clean
- biome clean
- vitest passes including new agent driver tests
- LLM can call ui_navigate, voice_changer_enable, etc. via tool calls
