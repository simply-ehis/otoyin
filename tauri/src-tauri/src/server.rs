//! Bundled-backend lifecycle: spawn/stop the `otoyin-server` sidecar binary,
//! forward its logs to the webview, and decide what happens on app close.
//!
//! The backend ships as a PyInstaller one-dir bundle staged at
//! `tauri/src-tauri/binaries/otoyin-server/` (CI build step) and registered
//! in `tauri.conf.json` under `bundle.resources`, so at runtime it lives at
//! `{resource_dir}/otoyin-server/otoyin-server[.exe]`. In development the
//! backend is run separately (`just dev`) — we detect that via a health probe
//! and adopt it instead of spawning a second process.

use crate::AppState;
use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const SERVER_HOST: &str = "127.0.0.1";
pub const SERVER_PORT: u16 = 17493;
pub const SERVER_URL: &str = "http://127.0.0.1:17493";

/// Runtime state for the local backend process.
#[derive(Default)]
pub struct ServerState {
    /// Handle to the child we spawned (None once stopped, or if we only
    /// adopted an externally running backend).
    pub child: Mutex<Option<Child>>,
    /// True only when this app instance spawned the process itself.
    pub started_by_us: AtomicBool,
    /// Mirror of the user's "keep running after close" preference.
    pub keep_running: AtomicBool,
    /// Guards the JS round-trip so a second close click can't re-enter.
    pub close_in_progress: AtomicBool,
}

#[derive(Serialize, Clone)]
pub struct ServerLogEntry {
    pub stream: String,
    pub line: String,
}

#[derive(Serialize, Clone)]
pub struct ServerErrorEvent {
    pub stage: String,
    pub message: String,
    pub errors: Option<Vec<String>>,
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "otoyin-server.exe"
    } else {
        "otoyin-server"
    }
}

/// Resolve the bundled backend binary: resource dir first (production
/// bundle), then the CI-staged location next to the build output.
fn resolve_binary(app: &AppHandle) -> Option<PathBuf> {
    let candidates = {
        let mut v = Vec::new();
        if let Ok(resource) = app.path().resolve(
            format!("otoyin-server/{}", binary_name()),
            tauri::path::BaseDirectory::Resource,
        ) {
            v.push(resource);
        }
        if let Ok(exe) = std::env::current_exe() {
            // .../src-tauri/target/<profile>/otoyin[.exe] -> .../src-tauri
            let src_tauri = exe.parent()?.parent()?.parent()?;
            v.push(
                src_tauri
                    .join("binaries")
                    .join("otoyin-server")
                    .join(binary_name()),
            );
        }
        v
    };
    candidates.into_iter().find(|p| p.is_file())
}

/// Quick TCP-level probe so we never block on a hung HTTP response.
fn probe_health() -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("{}:{}", SERVER_HOST, SERVER_PORT).parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_ok()
}

/// Kill the child we spawned (if any) and mark it stopped. Idempotent.
pub fn stop_if_ours(state: &State<'_, AppState>) {
    let mut guard = state.server.child.lock().unwrap();
    if state.server.started_by_us.swap(false, Ordering::SeqCst) {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn emit_error(app: &AppHandle, stage: &str, message: String) {
    let _ = app.emit(
        "server-error",
        ServerErrorEvent {
            stage: stage.to_string(),
            message,
            errors: None,
        },
    );
}

/// Forward a child's stdout/stderr lines to the webview as `server-log`.
fn forward_stream(app: AppHandle, stream: &'static str, reader: impl Read + Send + 'static) {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            match line {
                Ok(l) => {
                    let _ = app.emit(
                        "server-log",
                        ServerLogEntry {
                            stream: stream.to_string(),
                            line: l,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });
}

/// Spawn the bundled backend, attaching log forwarding.
fn spawn_bundled(app: &AppHandle, models_dir: Option<String>) -> Result<(), String> {
    let binary = resolve_binary(app).ok_or_else(|| {
        "bundled backend (otoyin-server) not found — start it manually (just dev)".to_string()
    })?;

    let mut cmd = Command::new(&binary);
    cmd.arg("--host")
        .arg(SERVER_HOST)
        .arg("--port")
        .arg(SERVER_PORT.to_string());
    if let Some(dir) = models_dir {
        if !dir.trim().is_empty() {
            cmd.arg("--data-dir").arg(dir);
        }
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn otoyin-server: {e}"))?;

    let out = child.stdout.take();
    let err = child.stderr.take();

    let state = app.state::<AppState>();
    {
        let mut guard = state.server.child.lock().unwrap();
        *guard = Some(child);
    }
    state.server.started_by_us.store(true, Ordering::SeqCst);

    if let Some(out) = out {
        forward_stream(app.clone(), "stdout", out);
    }
    if let Some(err) = err {
        forward_stream(app.clone(), "stderr", err);
    }

    Ok(())
}

/// Ensure a local backend is reachable. Adopts an already-running instance
/// (development flow) or spawns the bundled binary when present.
pub async fn ensure_started(app: &AppHandle, models_dir: Option<String>) -> Result<String, String> {
    let state = app.state::<AppState>();
    if state.server.started_by_us.load(Ordering::SeqCst) {
        return Ok(SERVER_URL.to_string());
    }
    if probe_health() {
        return Ok(SERVER_URL.to_string());
    }
    // Nothing on the port and no binary to launch? Stay quiet in dev — the
    // frontend health banner already tells the user how to start the backend.
    if resolve_binary(app).is_none() {
        return Ok(SERVER_URL.to_string());
    }
    spawn_bundled(app, models_dir)?;
    Ok(SERVER_URL.to_string())
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    remote: Option<bool>,
    models_dir: Option<String>,
) -> Result<String, String> {
    // Remote mode is user-managed: never touch the local backend.
    if remote.unwrap_or(false) {
        return Ok("remote".to_string());
    }
    if state.server.started_by_us.load(Ordering::SeqCst) || probe_health() {
        return Ok(SERVER_URL.to_string());
    }
    if let Err(e) = spawn_bundled(&app, models_dir) {
        emit_error(&app, "spawn", e.clone());
        return Err(e);
    }
    Ok(SERVER_URL.to_string())
}

#[tauri::command]
pub async fn stop_server(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    stop_if_ours(&state);
    let _ = app.emit(
        "server-log",
        ServerLogEntry {
            stream: "stdout".into(),
            line: "backend stopped by otoyin".into(),
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn restart_server(
    app: AppHandle,
    state: State<'_, AppState>,
    models_dir: Option<String>,
) -> Result<String, String> {
    stop_if_ours(&state);
    // Give the old process a moment to release the port before respawning.
    tokio::time::sleep(Duration::from_millis(400)).await;
    if probe_health() {
        // Something (re)took the port — treat as running rather than fighting it.
        return Ok(SERVER_URL.to_string());
    }
    if let Err(e) = spawn_bundled(&app, models_dir) {
        emit_error(&app, "spawn", e.clone());
        return Err(e);
    }
    Ok(SERVER_URL.to_string())
}

#[tauri::command]
pub async fn set_keep_server_running(
    state: State<'_, AppState>,
    keep_running: bool,
) -> Result<(), String> {
    state
        .server
        .keep_running
        .store(keep_running, Ordering::SeqCst);
    Ok(())
}
