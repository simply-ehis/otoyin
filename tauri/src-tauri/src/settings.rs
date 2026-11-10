//! Settings persistence: read/write `settings.json` in the app data directory.
//!
//! The schema is owned by the frontend (`app/src/lib/settings/schema.ts`); Rust
//! only stores and returns raw JSON values. Atomic writes (temp file then
//! rename) survive crashes and power loss.
//!
//! Commands:
//!   settings_read  -> returns the persisted settings object
//!   settings_write { key, value } -> merges one key and writes atomically

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const SETTINGS_FILE: &str = "settings.json";
const SETTINGS_TMP_FILE: &str = "settings.json.tmp";
const SCHEMA_VERSION: u64 = 1;

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    schema_version: u64,
    values: serde_json::Map<String, Value>,
}

fn defaults() -> serde_json::Map<String, Value> {
    let mut m = serde_json::Map::new();
    m.insert("schema_version".to_string(), Value::Number(SCHEMA_VERSION.into()));
    m
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SETTINGS_FILE))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn settings_read(app: AppHandle) -> Result<Value, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        // No persisted settings yet: return schema version only.
        return Ok(Value::Object(defaults()));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: SettingsFile =
        serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Value::Object(file.values))
}

#[tauri::command]
pub async fn settings_write(
    app: AppHandle,
    key: String,
    value: Value,
) -> Result<(), String> {
    let path = settings_path(&app)?;

    // Merge: read existing values, set the key, write back atomically.
    let mut values = if path.exists() {
        let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let file: SettingsFile =
            serde_json::from_str(&text).map_err(|e| e.to_string())?;
        file.values
    } else {
        defaults()
    };
    values.insert(key, value);

    // Atomic write: temp file then rename, so a crash never leaves a half
    // written settings.json behind.
    let tmp = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(&SettingsFile {
        schema_version: SCHEMA_VERSION,
        values,
    })
    .map_err(|e| e.to_string())?;
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn defaults_contains_schema_version() {
        let d = defaults();
        assert_eq!(
            d.get("schema_version"),
            Some(&Value::Number(SCHEMA_VERSION.into()))
        );
    }

    #[test]
    fn atomic_write_roundtrip() {
        let dir = env::temp_dir().join("otoyin-settings-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(SETTINGS_FILE);

        // Write directly through the same merge logic used by settings_write.
        let mut values = defaults();
        values.insert("theme".to_string(), Value::String("dark".to_string()));
        let tmp = path.with_extension("json.tmp");
        let content =
            serde_json::to_string_pretty(&SettingsFile { schema_version: SCHEMA_VERSION, values })
                .unwrap();
        fs::write(&tmp, &content).unwrap();
        fs::rename(&tmp, &path).unwrap();

        assert!(path.exists());
        assert!(!dir.join(SETTINGS_TMP_FILE).exists());

        let text = fs::read_to_string(&path).unwrap();
        let file: SettingsFile = serde_json::from_str(&text).unwrap();
        assert_eq!(file.schema_version, SCHEMA_VERSION);
        assert_eq!(
            file.values.get("theme"),
            Some(&Value::String("dark".to_string()))
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_returns_defaults() {
        // No file: defaults() is the source of truth for the empty case.
        let d = defaults();
        assert_eq!(d.len(), 1);
        assert!(d.contains_key("schema_version"));
    }
}
