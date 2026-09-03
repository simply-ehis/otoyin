PURPOSE: Persist agent/LLM preferences (context + token budget, memory toggle, thinking toggle) and expose them so the user can override the RAM-aware default with a clear warning.

OWNS: `backend/database/models.py` (`AssistantSettings` singleton), `backend/models.py` (`AssistantSettingsResponse`/`Update`), `backend/services/settings.py` (`get/update_assistant_settings`, `compute_effective_tokens`, `get_assistant_token_settings_for`), `backend/routes/settings.py` (`GET/PUT /settings/assistant`), `backend/routes/assistant_stream.py` (reads override via `get_assistant_token_settings_for` and passes `ctx_override`+`max_tokens` to `backend.generate`), `app/src/lib/api/{client,types}.ts`, `app/src/components/Assistant/AssistantSettings.tsx` (Context & Token Budget UI).

READ-WHEN: You change agent settings persistence, the context/token budget, or the settings UI.

KEY-FILES: `docs/knowledge/46-llm-context.md` (the RAM formula + max_tokens rule), `worksheets/assistant-expansion-plan.md` (Slice C2).

INVARIANTS:
- The RAM-aware default (from utils.llm_context) is ONLY a default. A persisted
  override in AssistantSettings ALWAYS wins and is clamped to [2048, 32768].
- context_tokens / max_tokens stored as NULL = "use RAM default". UI sends null
  on Reset.
- stream_local resolves the effective (n_ctx, max_tokens) against the model it
  is actually loading (req.model_id), not just the stored default, so overrides
  apply to whichever model runs.
- Non-chat LLM callers (services/personality.py compose+rewrite,
  services/refinement.py) now pass get_budget_max_tokens(model_size) instead of
  hardcoded 256/1024/2048, so their output length scales with the machine.
- NOTE: settings.py imports SessionLocal from ..database.session (not the
  ..database re-export), because the re-export binds the name at import time
  and stays None after init_db() rebinds SessionLocal. The live module import
  is required for the standalone token-settings readers.
- frontend shows an amber warning when the user sets context above the
  RAM-safe default (their RAM risk, explicitly allowed).

GOTCHAS:
- `AssistantSettings` is a singleton (id=1); `Base.metadata.create_all` creates
  the table on startup (no migration needed for a new table).
- The LLM backend `max_tokens` is clamped server-side to [2048, n_ctx]; a user
  max_tokens override higher than context is capped at n_ctx at generation time.
- This slice covers persistence + the context/token UI. The full unified
  settings surface (memory view/edit panel, chat-history view, model/GPU/
  sanitize/thinking controls consolidated) is built incrementally on top.

## Agent Callable
- **MCP Tools:** (none — assistant settings are UI-configured)
- **REST Endpoints:** `GET /settings/assistant`, `PUT /settings/assistant`, `GET /assistant/models`, `POST /assistant/validate-key`
- **Key Backend Files:** `backend/routes/settings.py`, `backend/routes/assistant.py`, `backend/services/settings.py`, `backend/models.py`
- **Key Frontend Files:** `app/src/components/Assistant/AssistantSettings.tsx`, `app/src/components/Assistant/AssistantPanel.tsx`

UPDATED: 2026-07-17
