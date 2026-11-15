PURPOSE: RAM-aware LLM context-window budget for the on-device GGUF planner backend, so the model never over-allocates its KV cache on small machines and the user can override it.

OWNS: `backend/utils/llm_context.py` (formula + clamp), `backend/backends/gguf_server_backend.py` (computes n_ctx at load, defaults generation max_tokens to 2048 capped at n_ctx), `backend/routes/models/capabilities.py` `GET /models/capabilities` (`llm_context` block), `app/src/features/assistant/ContextWindowIndicator.tsx` (shows the budget), `app/src/lib/api/client.ts` (`getModelCapabilities` typed return).

READ-WHEN: You change model sizes, the context budget, idle-unload behavior, or the Settings UI for LLM context/tokens.

KEY-FILES: `docs/knowledge/45-agent-manifest.md` (agent prompt source), `docs/knowledge/56-assistant-agent.md` (planner lineup + refinement).

INVARIANTS:
- n_ctx is chosen from TOTAL system RAM (psutil) and the loaded model size via `compute_llm_context`.
- A user override ALWAYS wins, clamped to [2048, 32768].
- Generation `max_tokens` defaults to 2048 and is capped at `n_ctx` (callers like assistant_stream pass explicit budgets).

GOTCHAS — two independent numbers, do not conflate:
- n_ctx (context window) is the ONLY RAM lever. Computed by the table below.
- max_tokens (generation length) uses NO RAM. Higher max_tokens = longer
  replies only (slower compute, user's cost), never more memory.

Confirmed n_ctx table (model size -> n_ctx by total RAM in GB):
- 1.2B: >=32 -> 32768 | 16-31 -> 24576 | 8-15 -> 16384 | 4-7 -> 8192
- 700M: >=16 -> 32768 | 8-15 -> 24576 | 4-7 -> 16384
- 350M: >=8 -> 32768 | 4-7 -> 24576
- 230M: all tiers -> 32768
- <4GB: extrapolate (2GB -> 4096, floor 2048)

max_tokens rule (simple, no adaptive logic):
- DEFAULT generation max_tokens == n_ctx (the table value), because the model
  uses tokens usefully and should not be strangled to a tiny cap.
- A caller-requested max_tokens is clamped only to the hardware range
  [MIN_CTX=2048, n_ctx]; the 2048 floor is the llama.cpp minimum, not a
  behavioral cap.
- The table math is ONLY the default. The user override (ctx_override) wins
  and may EXCEED our default (e.g. an 8GB user forcing 1.2B to 32768 context
  + tokens). The UI must show a clear warning when overriding past the safe
  default, since that is the user's RAM/compute risk, not ours.

## Agent Callable
- **MCP Tools:** `21labs.models_list`
- **REST Endpoints:** `GET /models/capabilities`
- **Key Backend Files:** `backend/utils/llm_context.py`, `backend/backends/gguf_server_backend.py`, `backend/routes/models/capabilities.py`
- **Key Frontend Files:** `app/src/features/assistant/AssistantSettings.tsx`

UPDATED: 2026-07-17
