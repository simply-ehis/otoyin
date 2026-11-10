# 95 — Settings schema + JSON storage

PURPOSE: Typed settings schema persisted to `settings.json` via Tauri commands — the single source of truth for user settings (design doc §5 slice S1).
OWNS: tauri/src-tauri/src/settings.rs, app/src/lib/settings/schema.ts, app/src/lib/settings/storage.ts, app/src/stores/settingsStore.ts, app/src/stores/uiStore.ts (theme delegation)
READ-WHEN: touching settings persistence, adding a new setting, or migrating another setting onto the schema
KEY-FILES: tauri/src-tauri/src/settings.rs, tauri/src-tauri/src/lib.rs, app/src/lib/settings/schema.ts, app/src/lib/settings/storage.ts, app/src/stores/settingsStore.ts, app/src/stores/uiStore.ts
INVARIANTS: Every setting is defined once in SETTINGS_SCHEMA (key, type, default, options, label, description, group, keywords, needsRestart, version). Rust persists raw JSON only; the frontend owns validation/defaults/clamping. Writes are atomic (temp → rename). `theme` is the proof point, migrated from uiStore localStorage onto the schema.
GOTCHAS: `cargo test` cannot run in this environment — a pre-existing taurin-cli/tauri.conf.json version mismatch fails the tauri build script before compiling. `settings.rs` follows the exact `#[tauri::command]` + `Result<T, String>` pattern of `server.rs` commands. When Tauri isn't available (tests/dev), readSettings returns {} and writeSetting is a no-op.
UPDATED: 2026-11-10

## Rust commands (`tauri/src-tauri/src/settings.rs`)

- `settings_read(app) -> Result<Value, String>` — reads settings.json from app_data_dir; returns schema-version-only object when no file exists.
- `settings_write(app, key, value) -> Result<(), String>` — merges one key into existing values and writes atomically (temp file then rename).
- Registered in `lib.rs` invoke_handler alongside the existing `server.rs` commands.

## Frontend

- `app/src/lib/settings/schema.ts` — `SettingDef` type, `SETTINGS_SCHEMA` (currently `theme`), `settingDef(key)`, `clampValue(def, value)`.
- `app/src/lib/settings/storage.ts` — `readSettings()` / `writeSetting(key, value)` via Tauri `invoke`; degrades gracefully without Tauri.
- `app/src/stores/settingsStore.ts` — zustand store: `loadSettings`, `setSetting` (validate + clamp + persist), `getSetting` (clamp on read, default fallback), `isModified(key)`. Auto-loads on import.
- `app/src/stores/uiStore.ts` — `theme`/`setTheme` delegate to settingsStore; `theme` removed from uiStore `partialize`; a `settingsStore.subscribe` syncs the persisted theme when loading completes. All existing `theme`/`setTheme` consumers work unchanged.

## Tests

- `app/src/stores/settingsStore.test.ts` — schema fields, defaults, clamping, persistence via mocked invoke, graceful degradation (8 tests).
- Rust unit tests in `settings.rs` (defaults + atomic-write roundtrip) could not run due to the pre-existing tauri.conf.json/taurin-cli version mismatch.

## Next (not in S1)

- OS credential store (keyring) for API keys — design doc §5.3.
- Schema-driven settings UI generation for all settings pages.
- Appearance accent presets + contrast guard — design doc §5.5.
- Settings backup/export (JSON without keys).
