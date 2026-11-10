# Worksheet — §5 S2 Credential Store

PURPOSE: Record progress on credential store slice (OS keyring for API keys).
KEY-FILES: tauri/src-tauri/Cargo.toml, tauri/src-tauri/src/settings.rs, app/src/lib/settings/credentialStore.ts, app/src/lib/settings/schema.ts, app/src/stores/settingsStore.ts, app/src/features/settings/ApiKeysPage.tsx
INVARIANTS: Keys never in settings.json (JSON only records has_key flag). Keys in OS credential store via Tauri keyring commands. Fallback to encrypted file if keyring unavailable. Full key never shown again (masked ••••1234).
UPDATED: 2026-11-11

## Steps
1. [ ] Add `keyring` crate to Cargo.toml
2. [ ] Add Tauri commands: credential_set, credential_get, credential_delete in settings.rs
3. [ ] Register commands in lib.rs invoke_handler
4. [ ] Create app/src/lib/settings/credentialStore.ts (keyring wrapper + encrypted file fallback)
5. [ ] Add settings schema entries for api_keys.<domain>.has_key
6. [ ] Extend settingsStore.ts with credential get/set/delete
7. [ ] Migrate ApiKeysPage.tsx to credential store (masked display, Replace/Remove)
8. [ ] Tests: credentialStore tests + ApiKeysPage behavior
9. [ ] Gate: 11/11 pass

## Verification
- typecheck clean
- biome clean on all touched files
- backend cargo build (keyring compiles)
- credentialStore tests pass
- ApiKeysPage: key stored in keyring, not settings.json; masked display works
