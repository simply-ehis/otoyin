---
PURPOSE: True-BYOK cloud model provider storage for otoyin (arbitrary endpoint + key per domain).
OWNS: backend/utils/secret_store.py, backend/services/model_providers.py, backend/routes/model_providers.py, ModelProvider ORM row.
READ-WHEN: Adding/auditing user-supplied cloud endpoints (tts/music/sfx/vc/llm), credential encryption at rest, or provider CRUD API.
KEY-FILES:
  - backend/utils/secret_store.py — Fernet encrypt/decrypt, per-install key (env TWENTYLABS_SECRET or auto-gen local keyfile).
  - backend/services/model_providers.py — CRUD + provider_credentials() returning decrypted {base_url,api_key,model}.
  - backend/routes/model_providers.py — REST /model-providers CRUD (GET list, POST create, GET/PATCH/DELETE by id).
  - backend/database/models.py — ModelProvider table (id, domain, name, base_url, model, encrypted_api_key, is_default).
INVARIANTS:
  - API key stored ONLY as ciphertext (Fernet). List/get responses never echo plaintext key; they expose only has_api_key bool.
  - Exactly one default provider per domain (set_default clears others).
  - No curated provider list — users supply any arbitrary base URL + key (true BYOK).
  - Offline-first preserved: BYOK is opt-in; engines must not require a provider to run locally. The store only enables cloud when a caller reads provider_credentials().
GOTCHAS:
  - Per-install Fernet key auto-generated to ~/.cache/TWENTYLABS/TWENTYLABS_SECRET.key (chmod 600). If that key is lost/rotated, existing ciphertext is unrecoverable — acceptable for single-user local app.
  - Default SQLite session (SessionLocal) is used by the routes; tests build a temp engine and dispose it to release the file lock.
  - provider_credentials() is the ONLY path that decrypts a key; engines that want cloud must call it via get_default_provider(domain) + provider_credentials().
CONSUMPTION (wired):
  - backend/services/cloud_provider.py is the single consumer: get_cloud_provider(domain) -> decrypted creds or None; call_openai_chat (llm /chat/completions); call_openai_speech (tts /audio/speech); synthesize_via_cloud_tts(domain, text, voice) -> (bytes, ctype).
  - TTS orchestration (backend/services/generation.py run_generation) honors an opt-in use_cloud flag: when True it routes synthesis through synthesize_via_cloud_tts (OpenAI-compatible) instead of the local model, then shares the normal persist/effects/normalize pipeline. Offline-first preserved (default use_cloud=False).
  - API surface: GenerationRequest.use_cloud (backend/models.py) + DB generations.use_cloud column (backend/database/models.py) so retry/regenerate reuse the same routing. generations.py threads use_cloud into run_generation.
  - The llm domain has a generic client (call_openai_chat) ready for assistant consumption; wiring the assistant's existing ApiProvider settings flow to the store is a separate follow-up (not yet done).
   - ASSISTANT LLM WIRING (done): backend/routes/assistant.py assistant_chat resolves LLM creds as
     explicit request params (api_key/api_base_url) OR, when absent, the default 'llm' BYOK
     provider from the store (true BYOK, no preset list). Explicit params win; stored model id
     fills the default. Streamed via stream_api (SSE /chat/completions).
UPDATED: 2026-07-19
---

## Agent Callable
- **MCP Tools:** (none — BYOK is managed via Settings UI)
- **REST Endpoints:** `GET /model-providers`, `POST /model-providers`, `GET /model-providers/{id}`, `PATCH /model-providers/{id}`, `DELETE /model-providers/{id}`
- **Key Backend Files:** `backend/routes/model_providers.py`, `backend/services/model_providers.py`
- **Key Frontend Files:** `app/src/features/settings/ApiKeysPage.tsx`