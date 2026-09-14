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
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const SERVER_HOST: &str = "127.0.0.1";
pub const SERVER_PORT: u16 = 17493;

/// Maximum number of consecutive auto-restarts before giving up.
const MAX_AUTO_RESTARTS: u32 = 5;
/// Cooldown between restart attempts to avoid tight loops.
const RESTART_COOLDOWN_MS: u64 = 2000;
/// How long the process must run to be considered "stable" (resets restart counter).
const STABLE_SECONDS: u64 = 30;

/// Runtime state for the local backend process.
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
    /// Number of consecutive auto-restart attempts.
    pub restart_count: AtomicU32,
    /// When true, auto-restart is suppressed (user-initiated stop or max restarts).
    pub auto_restart_disabled: AtomicBool,
    /// Port the backend is (being) served on — the in-app port setting.
    /// Probes, spawn args, and command URLs all read this so a custom
    /// port survives restarts instead of silently reverting to 17493.
    pub current_port: Mutex<u16>,
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            started_by_us: AtomicBool::new(false),
            keep_running: AtomicBool::new(false),
            close_in_progress: AtomicBool::new(false),
            restart_count: AtomicU32::new(0),
            auto_restart_disabled: AtomicBool::new(false),
            current_port: Mutex::new(SERVER_PORT),
        }
    }
}

/// Read the serving port (lock-poisoning-proof like every other state read).
fn current_port(state: &State<'_, AppState>) -> u16 {
    state
        .server
        .current_port
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Remember the serving port after a user-initiated (re)start.
fn set_current_port(state: &State<'_, AppState>, port: u16) {
    if let Ok(mut guard) = state.server.current_port.lock() {
        *guard = port;
    }
}

fn server_url(port: u16) -> String {
    format!("http://{}:{}", SERVER_HOST, port)
}

/// Port the backend will bind, for spawn paths with no explicit port.
///
/// The backend writes `{data_dir}/runtime/backend_port.json` on every boot
/// (see `backend/main.py`), and the sidecar inherits our working directory
/// — so when no `--data-dir` override is given, `<cwd>/data/...` is the
/// same directory the backend will use. Best-effort: any failure means
/// "fall back to the default port".
fn persisted_spawn_port(models_dir: &Option<String>) -> Option<u16> {
    let base = match models_dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => std::env::current_dir().ok()?.join("data"),
    };
    let text = std::fs::read_to_string(base.join("runtime").join("backend_port.json")).ok()?;
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    let port: u16 = digits.parse().ok()?;
    (1024..=65535).contains(&port).then_some(port)
}

/// Resolve the spawn port: explicit command arg > persisted file > default.
fn resolve_spawn_port(models_dir: &Option<String>, explicit: Option<u16>) -> u16 {
    explicit
        .filter(|p| (1024..=65535).contains(p))
        .or_else(|| persisted_spawn_port(models_dir))
        .unwrap_or(SERVER_PORT)
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
fn probe_health(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("{}:{}", SERVER_HOST, port)
            .parse()
            .unwrap_or_else(|_| "127.0.0.1:8000".parse().unwrap()),
        Duration::from_millis(300),
    )
    .is_ok()
}

/// Consecutive failed HTTP readiness checks before a hung (but alive)
/// backend is killed and restarted.
const MAX_UNHEALTHY_CHECKS: u32 = 5;
/// Uptime before readiness enforcement starts — imports + first model
/// load keep /health/ready false for a while on slow machines.
const STARTUP_GRACE_SECONDS: u64 = 120;

/// HTTP readiness probe: true only when the backend answers /health/ready
/// with ready:true. A live-but-hung event loop fails this (timeout or
/// still-initializing), which is exactly the hang we want to catch.
fn http_ready(client: &reqwest::blocking::Client, port: u16) -> bool {
    client
        .get(format!("{}/health/ready", server_url(port)))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map(|body| body.contains("\"ready\":true") || body.contains("\"ready\": true"))
        .unwrap_or(false)
}

/// Kill the child we spawned (if any) and mark it stopped. Idempotent.
pub fn stop_if_ours(state: &State<'_, AppState>) {
    // Suppress auto-restart so the monitor thread doesn't respawn it.
    state
        .server
        .auto_restart_disabled
        .store(true, Ordering::SeqCst);
    let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
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
fn spawn_bundled(app: &AppHandle, models_dir: Option<String>, port: Option<u16>) -> Result<(), String> {
    let binary = resolve_binary(app).ok_or_else(|| {
        "bundled backend (otoyin-server) not found — start it manually (just dev)".to_string()
    })?;

    let port = resolve_spawn_port(&models_dir, port);
    set_current_port(&app.state::<AppState>(), port);

    let mut cmd = Command::new(&binary);
    cmd.arg("--host")
        .arg(SERVER_HOST)
        .arg("--port")
        .arg(port.to_string());
    if let Some(ref dir) = models_dir {
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
        let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(child);
    }
    state.server.started_by_us.store(true, Ordering::SeqCst);

    if let Some(out) = out {
        forward_stream(app.clone(), "stdout", out);
    }
    if let Some(err) = err {
        forward_stream(app.clone(), "stderr", err);
    }

    // Spawn auto-restart monitor thread
    spawn_restart_monitor(app.clone(), models_dir, port);

    Ok(())
}

/// Monitor the child process. Restarts it (up to MAX_AUTO_RESTARTS times)
/// when it exits unexpectedly OR when it stays alive but stops answering
/// readiness probes (hung event loop / deadlock). Resets the counter if the
/// process runs stably for STABLE_SECONDS (a later crash is not a boot loop).
///
/// Only ever tracks the child this monitor was spawned for (by pid): if the
/// handle was replaced (user restart/stop spawns its own monitor), this
/// monitor exits instead of fighting over the new process.
fn spawn_restart_monitor(app: AppHandle, models_dir: Option<String>, port: u16) {
    std::thread::spawn(move || {
        // Give the process time to start before monitoring.
        std::thread::sleep(Duration::from_secs(3));

        let state = app.state::<AppState>();
        let child_pid = {
            let guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
            guard.as_ref().map(|c| c.id())
        };
        let Some(pid) = child_pid else {
            return;
        };

        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .ok();
        // Wait for the child to exit. We poll via waitpid with WNOHANG.
        let start = std::time::Instant::now();
        let mut unhealthy: u32 = 0;
        loop {
            std::thread::sleep(Duration::from_secs(2));

            // If auto-restart was disabled (user-initiated stop), exit the monitor.
            if state
                .server
                .auto_restart_disabled
                .load(Ordering::SeqCst)
            {
                return;
            }

            // Still our child? A user restart/stop replaces the handle and
            // spawns its own monitor — exit instead of touching the new process.
            let is_ours = {
                let guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
                guard.as_ref().map(|c| c.id()) == Some(pid)
            };
            if !is_ours {
                return;
            }

            // try_wait: Ok(Some) = exited, Ok(None) = still running.
            let exited_status = {
                let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
                match guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(status) => status,
                        Err(_) => continue, // Uncertain — never kill on uncertainty.
                    },
                    None => None,
                }
            };

            if exited_status.is_none() {
                // Alive: hang-detect via readiness (past the startup grace window).
                let past_grace =
                    start.elapsed().as_secs() >= STARTUP_GRACE_SECONDS;
                let ready = !past_grace
                    || client.as_ref().map(|c| http_ready(c, port)).unwrap_or(false);
                if ready {
                    unhealthy = 0;
                    continue;
                }
                unhealthy += 1;
                if unhealthy < MAX_UNHEALTHY_CHECKS {
                    continue;
                }
                // Hung: kill so the restart path below revives it.
                // (No unhealthy reset needed — this path always returns
                // after spawning a fresh monitor.)
                let _ = app.emit(
                    "server-log",
                    ServerLogEntry {
                        stream: "stderr".into(),
                        line: "backend unresponsive (readiness failing) — restarting it"
                            .into(),
                    },
                );
                {
                    let mut guard =
                        state.server.child.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(child) = guard.as_mut().filter(|c| c.id() == pid) {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }

            // Process exited (or was just killed as hung).
            let elapsed = start.elapsed().as_secs();

                // If it ran long enough, reset the restart counter (not a boot loop).
                if elapsed >= STABLE_SECONDS {
                    state.server.restart_count.store(0, Ordering::SeqCst);
                }

                let restarts = state.server.restart_count.load(Ordering::SeqCst);
                if restarts >= MAX_AUTO_RESTARTS {
                    let _ = app.emit(
                        "server-error",
                        ServerErrorEvent {
                            stage: "auto-restart".into(),
                            message: format!(
                                "backend crashed {} times — auto-restart disabled",
                                restarts
                            ),
                            errors: None,
                        },
                    );
                    return;
                }

                // Clear the dead child handle.
                {
                    let mut guard =
                        state.server.child.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(mut child) = guard.take() {
                        let _ = child.wait();
                    }
                }

                // Wait before restarting.
                std::thread::sleep(Duration::from_millis(RESTART_COOLDOWN_MS));

                // Re-check auto-restart flag after cooldown.
                if state
                    .server
                    .auto_restart_disabled
                    .load(Ordering::SeqCst)
                {
                    return;
                }

                state
                    .server
                    .restart_count
                    .fetch_add(1, Ordering::SeqCst);
                let _ = app.emit(
                    "server-log",
                    ServerLogEntry {
                        stream: "stdout".into(),
                        line: format!(
                            "auto-restarting backend (attempt {})",
                            state.server.restart_count.load(Ordering::SeqCst)
                        ),
                    },
                );

                // Attempt restart.
                if let Err(e) = spawn_bundled_silent(&app, models_dir.clone(), Some(port)) {
                    let _ = app.emit(
                        "server-error",
                        ServerErrorEvent {
                            stage: "auto-restart".into(),
                            message: format!("restart failed: {e}"),
                            errors: None,
                        },
                    );
                    return;
                }

                // Re-read the new child PID for the next loop iteration.
                // (The recursive spawn_bundled_silent already set up a new monitor.)
                return;
        }
    });
}

/// Spawn without attaching a restart monitor (called from the monitor thread
/// to avoid recursive monitor spawning).
fn spawn_bundled_silent(app: &AppHandle, models_dir: Option<String>, port: Option<u16>) -> Result<(), String> {
    let binary = resolve_binary(app).ok_or_else(|| {
        "bundled backend (otoyin-server) not found — start it manually (just dev)".to_string()
    })?;

    let port = resolve_spawn_port(&models_dir, port);
    set_current_port(&app.state::<AppState>(), port);

    let mut cmd = Command::new(&binary);
    cmd.arg("--host")
        .arg(SERVER_HOST)
        .arg("--port")
        .arg(port.to_string());
    if let Some(ref dir) = models_dir {
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
        let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(child);
    }
    state.server.started_by_us.store(true, Ordering::SeqCst);

    if let Some(out) = out {
        forward_stream(app.clone(), "stdout", out);
    }
    if let Some(err) = err {
        forward_stream(app.clone(), "stderr", err);
    }

    // Spawn a NEW monitor for this new child (replaces the old one that exited).
    spawn_restart_monitor(app.clone(), models_dir, port);

    Ok(())
}

/// Ensure a local backend is reachable. Adopts an already-running instance
/// (development flow) or spawns the bundled binary when present.
pub async fn ensure_started(app: &AppHandle, models_dir: Option<String>) -> Result<String, String> {
    let state = app.state::<AppState>();
    let port = current_port(&state);
    if state.server.started_by_us.load(Ordering::SeqCst) {
        return Ok(server_url(port));
    }
    if probe_health(port) {
        return Ok(server_url(port));
    }
    // Nothing on the port and no binary to launch? Stay quiet in dev — the
    // frontend health banner already tells the user how to start the backend.
    if resolve_binary(app).is_none() {
        return Ok(server_url(port));
    }
    spawn_bundled(app, models_dir, Some(port))?;
    Ok(server_url(port))
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    remote: Option<bool>,
    models_dir: Option<String>,
    port: Option<u16>,
) -> Result<String, String> {
    // Remote mode is user-managed: never touch the local backend.
    if remote.unwrap_or(false) {
        return Ok("remote".to_string());
    }
    // An explicit port (in-app port setting) wins and is remembered for
    // probes, monitors, and future restarts. Otherwise the spawn path
    // resolves the persisted port file, falling back to the default.
    if let Some(p) = port {
        set_current_port(&state, p);
    }
    let active_port = current_port(&state);
    // Reset auto-restart state for a fresh start.
    state
        .server
        .auto_restart_disabled
        .store(false, Ordering::SeqCst);
    state.server.restart_count.store(0, Ordering::SeqCst);
    if state.server.started_by_us.load(Ordering::SeqCst) || probe_health(active_port) {
        return Ok(server_url(active_port));
    }
    if let Err(e) = spawn_bundled(&app, models_dir, port) {
        emit_error(&app, "spawn", e.clone());
        return Err(e);
    }
    Ok(server_url(active_port))
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
    port: Option<u16>,
) -> Result<String, String> {
    // User-initiated restart: reset auto-restart state.
    state
        .server
        .auto_restart_disabled
        .store(false, Ordering::SeqCst);
    state.server.restart_count.store(0, Ordering::SeqCst);
    // An explicit port (in-app port setting) wins and is remembered.
    if let Some(p) = port {
        set_current_port(&state, p);
    }
    let active_port = current_port(&state);
    stop_if_ours(&state);
    // Re-enable auto-restart for the new process.
    state
        .server
        .auto_restart_disabled
        .store(false, Ordering::SeqCst);
    // Give the old process a moment to release the port before respawning.
    tokio::time::sleep(Duration::from_millis(400)).await;
    if probe_health(active_port) {
        // Something (re)took the port — treat as running rather than fighting it.
        return Ok(server_url(active_port));
    }
    if let Err(e) = spawn_bundled(&app, models_dir, port) {
        emit_error(&app, "spawn", e.clone());
        return Err(e);
    }
    Ok(server_url(active_port))
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
