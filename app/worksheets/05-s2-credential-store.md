# Worksheet — §5 S2 Credential Store

STATUS: COMPLETE

## Changes
- `app/src/lib/settings/credentialStore.ts` (new): `setCredential`/`getCredential`/`deleteCredential` wrappers around Tauri commands; degrades gracefully without Tauri
- `app/src/lib/settings/schema.ts`: Added `api_keys.<domain>.has_key` schema entries for all 6 domains (llm, stt, tts, sfx, music, vc)
- `app/src/stores/settingsStore.ts`: Added `setCredentialKey`/`getCredentialKey`/`deleteCredentialKey`/`hasCredentialKey` methods; `CREDENTIAL_SERVICE` imported from credentialStore
- `app/src/features/settings/ApiKeysPage.tsx`: Migrated from backend API key storage to OS credential store; keys stored via `setCredentialKey`, key existence via `hasCredentialKey`; `api_key` no longer sent to backend API
- `app/src/stores/settingsStore.test.ts`: 6 tests for credential store (set/get/delete/has_key)

## Gate: 11/11 ALL CHECKS PASSED
- typecheck: clean
- biome: clean
- vitest: 6 tests pass in settingsStore.test.ts

## Files changed (committed in agent driver commit 5a7d48b1)
- app/src/lib/settings/credentialStore.ts (new)
- app/src/lib/settings/schema.ts (modified)
- app/src/stores/settingsStore.ts (modified)
- app/src/stores/settingsStore.test.ts (modified)
- app/src/features/settings/ApiKeysPage.tsx (modified)
- tauri/src-tauri/Cargo.toml (keyring crate - from earlier)
- tauri/src-tauri/src/settings.rs (credential commands - from earlier)
- tauri/src-tauri/src/lib.rs (command registration - from earlier)
