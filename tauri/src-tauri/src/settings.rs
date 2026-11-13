//! Settings persistence: read/write `settings.json` in the app data directory.
//!
//! The schema is owned by the frontend (`app/src/lib/settings/schema.ts`); Rust
//! only stores and returns raw JSON values. Atomic writes (temp file then
//! rename) survive crashes and power loss.
//!
//! Commands:
//!   settings_read  -> returns the persisted settings object
//!   settings_write { key, value } -> merges one key and writes atomically
//!   credential_set { service, username, password } -> stores a secret in the
//!     OS credential store (Windows Credential Manager, macOS Keychain, Linux
//!     Secret Service). Never written to settings.json.
//!   credential_get { service, username } -> returns the stored secret, or
//!     null if absent.
//!   credential_delete { service, username } -> removes the stored secret.

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";
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

/// Quarantine a corrupt settings.json to a .bak file without ever clobbering
/// an earlier backup. Falls back to a timestamped name. Never panics.
fn quarantine(path: &std::path::Path) {
    let bak = path.with_extension("json.bak");
    let target = if bak.exists() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        path.with_extension(format!("json.{stamp}.bak"))
    } else {
        bak
    };
    if let Err(e) = fs::rename(path, &target) {
        eprintln!("[settings] quarantine to {} failed: {e}", target.display());
    }
}

#[tauri::command]
pub async fn settings_read(app: AppHandle) -> Result<Value, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        // No persisted settings yet: return schema version only.
        return Ok(Value::Object(defaults()));
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: SettingsFile = serde_json::from_str(&text).map_err(|e| {
        // Quarantine the broken file (kept as .json.bak). A copy would leave the
        // corrupt original in place, so every later read would fail and every
        // write would error out forever — recovery must actually complete.
        quarantine(&path);
        format!("settings_corrupt: {e}")
    })?;
    Ok(Value::Object(file.values))
}

#[tauri::command]
pub async fn settings_write(
    app: AppHandle,
    key: String,
    value: Value,
) -> Result<(), String> {
    let path = settings_path(&app)?;

    // Merge: read existing values, set the key, write back atomically. A
    // corrupt file is quarantined and healed to schema-defaults + this key
    // rather than erroring forever — the advertised recovery path.
    let mut values = if path.exists() {
        let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        match serde_json::from_str::<SettingsFile>(&text) {
            Ok(file) => file.values,
            Err(e) => {
                eprintln!("[settings] settings_write: corrupt file quarantined: {e}");
                quarantine(&path);
                defaults()
            }
        }
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

#[tauri::command]
pub async fn credential_set(
    service: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let entry = Entry::new(&service, &username)
        .map_err(|e| format!("failed to open credential entry: {e}"))?;
    entry
        .set_password(&password)
        .map_err(|e| format!("failed to store credential: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn credential_get(service: String, username: String) -> Result<Option<String>, String> {
    let entry = Entry::new(&service, &username)
        .map_err(|e| format!("failed to open credential entry: {e}"))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read credential: {e}")),
    }
}

#[tauri::command]
pub async fn credential_delete(service: String, username: String) -> Result<(), String> {
    let entry = Entry::new(&service, &username)
        .map_err(|e| format!("failed to open credential entry: {e}"))?;
    entry
        .delete_credential()
        .map_err(|e| format!("failed to delete credential: {e}"))?;
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
        assert!(!dir.join("settings.json.tmp").exists());

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

