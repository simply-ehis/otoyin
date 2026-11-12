//! Startup health + pending-update bookkeeping (§8 P2, §6).
//!
//! `app_ready` lets the renderer tell Rust it has committed at least once;
//! the hidden-window watchdog in lib.rs uses it.
//! `updater_set_pending_install` marks a downloaded update pending; the
//! CloseRequested path installs it instead of a plain close (§6 "Later").

use std::sync::atomic::Ordering;
use tauri::Manager;

/// Startup state persisted across commands (§8 P2).
#[derive(Default)]
pub(crate) struct StartupState {
    /// Renderer committed at least once (hidden-window watchdog reads this).
    pub app_ready: std::sync::atomic::AtomicBool,
    /// Consecutive backend auto-start failures, persisted across launches.
    pub backend_failures: std::sync::atomic::AtomicU32,
    /// Downloaded update waiting to be applied on quit (§6 "Later").
    pub update_pending_install: std::sync::atomic::AtomicBool,
}

/// Path of the persisted consecutive-backend-failure counter.
fn startup_health_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("startup-health.json"))
}

pub(crate) fn read_backend_failures(app: &tauri::AppHandle) -> u32 {
    startup_health_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|v| v.get("consecutive_backend_failures").cloned())
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32
}

pub(crate) fn write_backend_failures(app: &tauri::AppHandle, failures: u32) {
    let Some(path) = startup_health_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let content = serde_json::json!({ "consecutive_backend_failures": failures });
    let _ = std::fs::write(&path, content.to_string());
}

/// Renderer signals it has committed at least once (§8 P2 hidden-window watchdog).
#[tauri::command]
pub fn app_ready(state: tauri::State<'_, crate::AppState>) {
    state.startup.app_ready.store(true, Ordering::SeqCst);
}

/// Mark a downloaded update pending-install on quit (§6 "Later").
#[tauri::command]
pub fn updater_set_pending_install(
    state: tauri::State<'_, crate::AppState>,
    pending: bool,
) {
    state
        .startup
        .update_pending_install
        .store(pending, Ordering::SeqCst);
}

/// Clear the crash-loop counter after a successful manual engine start (§8 P2).
/// Without this the persisted failure count never resets outside the
/// auto-start path, so a user who starts the engine manually re-enters safe
/// mode on every subsequent launch — a permanent demotion the design never
/// wanted. Called by the "Start engine anyway" banner action on success.
#[tauri::command]
pub fn safe_mode_clear(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) {
    state.startup.backend_failures.store(0, Ordering::SeqCst);
    write_backend_failures(&app, 0);
}
