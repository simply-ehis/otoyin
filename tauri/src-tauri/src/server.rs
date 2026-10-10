//! Bundled-backend lifecycle: spawn/stop the `otoyin-server` sidecar binary,
//! forward its logs to the webview, and decide what happens on app close.
//!
//! The backend ships as a PyInstaller one-dir bundle staged at
//! `tauri/src-tauri/binaries/otoyin-server/` (CI build step) and registered
//! in `tauri.conf.json` under `bundle.resources`, so at runtime it lives at
//! `{resource_dir}/otoyin-server/otoyin-server[.exe]`. In development the
//! backend is run separately (`just dev`) - we detect that via a health probe
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
    /// Guards the close path so a second close click can't re-enter.
    pub close_in_progress: AtomicBool,
    /// Number of consecutive auto-restart attempts.
    pub restart_count: AtomicU32,
    /// When true, auto-restart is suppressed (user-initiated stop or max restarts).
    pub auto_restart_disabled: AtomicBool,
    /// Port the backend is (being) served on - the in-app port setting.
    /// Probes, spawn args, and command URLs all read this so a custom
    /// port survives restarts instead of silently reverting to 17493.
    pub current_port: Mutex<u16>,
    /// Data dir the backend was launched with, remembered so the owner lock
    /// can be released on shutdown without a command being invoked.
    pub models_dir: Mutex<Option<String>>,
}

impl AppState {
    /// Data dir handed to the backend at spawn time (None = the default).
    pub fn models_dir(&self) -> Option<String> {
        self.server.models_dir.lock().ok().and_then(|g| g.clone())
    }

    /// Remember the spawn data dir so the owner lock path is known later.
    pub fn set_models_dir(&self, dir: Option<String>) {
        if let Ok(mut guard) = self.server.models_dir.lock() {
            *guard = dir;
        }
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            started_by_us: AtomicBool::new(false),
            close_in_progress: AtomicBool::new(false),
            restart_count: AtomicU32::new(0),
            auto_restart_disabled: AtomicBool::new(false),
            current_port: Mutex::new(SERVER_PORT),
            models_dir: Mutex::new(None),
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
/// - so when no `--data-dir` override is given, `<cwd>/data/...` is the
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

// - Backend ownership lock -
//
// The port alone cannot say *who* owns the backend. Without an owner record a
// crashed or force-killed app leaves an orphaned `otoyin-server.exe` squatting
// the port; the next launch then either adopts that stale process or silently
// rotates to another port, and the frontend ends up pointed at a backend the
// app does not manage.
//
// The lock is a small JSON file next to the port file. It records the pid we
// spawned plus the port, so a later launch can tell three cases apart:
//   * lock + live pid + healthy HTTP  -> adopt, do not spawn
//   * lock + dead pid                 -> stale, reclaim the port
//   * no lock but port busy           -> a foreign process; report, never rotate

#[derive(Serialize, serde::Deserialize, Clone, Debug)]
struct OwnerLock {
    pid: u32,
    port: u16,
}

/// Runtime dir holding the port + owner files. Mirrors the backend's own
/// `<data_dir>/runtime/` convention (see `persisted_spawn_port`).
fn runtime_dir(models_dir: &Option<String>) -> Option<PathBuf> {
    let base = match models_dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => std::env::current_dir().ok()?.join("data"),
    };
    Some(base.join("runtime"))
}

fn owner_lock_path(models_dir: &Option<String>) -> Option<PathBuf> {
    Some(runtime_dir(models_dir)?.join("backend_owner.json"))
}

/// True when a process with this id exists and we may signal it.
fn pid_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        // tasklist is present on every supported Windows; filtering by PID
        // avoids OpenProcess handle/permission surprises.
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        Path::new(&format!("/proc/{}", pid)).exists()
    }
}

fn read_owner_lock(models_dir: &Option<String>) -> Option<OwnerLock> {
    let path = owner_lock_path(models_dir)?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_owner_lock(models_dir: &Option<String>, pid: u32, port: u16) {
    let Some(path) = owner_lock_path(models_dir) else {
        return;
    };
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            eprintln!(
                "otoyin: cannot create {} for the owner lock",
                parent.display()
            );
            return;
        }
    }
    let lock = OwnerLock { pid, port };
    match serde_json::to_string(&lock) {
        Ok(json) => {
            if std::fs::write(&path, json).is_err() {
                eprintln!("otoyin: failed to write owner lock {}", path.display());
            }
        }
        Err(e) => eprintln!("otoyin: could not serialise the owner lock: {e}"),
    }
}

fn clear_owner_lock(models_dir: &Option<String>) {
    if let Some(path) = owner_lock_path(models_dir) {
        let _ = std::fs::remove_file(path);
    }
}

/// What the port looks like before we try to spawn on it.
#[derive(Debug)]
enum PortOccupancy {
    /// Nothing is listening - safe to bind.
    Free,
    /// Our own previously-spawned backend is alive and healthy; reuse it.
    OursAlive(OwnerLock),
    /// A lock exists but its process is gone - the port can be reclaimed.
    StaleLock(OwnerLock),
    /// Something else holds the port. Not ours to kill or reuse.
    Foreign,
}

fn inspect_port(port: u16, models_dir: &Option<String>) -> PortOccupancy {
    if !tcp_busy(port) {
        return PortOccupancy::Free;
    }
    match read_owner_lock(models_dir) {
        Some(lock) if lock.port == port && pid_alive(lock.pid) && backend_http_ready(port) => {
            PortOccupancy::OursAlive(lock)
        }
        Some(lock) if lock.port == port => PortOccupancy::StaleLock(lock),
        _ => PortOccupancy::Foreign,
    }
}

/// What to do about the port before spawning.
#[derive(Debug)]
enum BindPlan {
    /// Start a new backend on this port.
    Spawn(u16),
    /// A healthy backend we already own is serving this port; spawn nothing.
    Adopt(u16),
}

/// `plan_bind` is normally driven from a Tauri command where a managed
/// `State<'_, AppState>` is in hand. For direct unit tests we need a
/// `State` that is not backed by the Tauri manager, so keep the port-write
/// step in a helper that takes the plain inner state; `State` derefs to it.
fn set_current_port_inner(state: &AppState, port: u16) {
    if let Ok(mut guard) = state.server.current_port.lock() {
        *guard = port;
    }
}

/// Apply the ownership rules to decide whether to spawn, and where.
///
/// Shared by `spawn_bundled` and `spawn_bundled_silent` so the first launch and
/// an auto-restart can never disagree. The restart path used to carry its own
/// copy of the old `find_free_port(desired + 1)` fallback, which meant a crash
/// could still move the backend to a different port than the frontend is
/// pointed at - the exact desync this whole mechanism exists to prevent.
fn plan_bind(desired: u16, models_dir: &Option<String>, state: &AppState) -> Result<BindPlan, String> {
    match inspect_port(desired, models_dir) {
        PortOccupancy::Free => {
            clear_owner_lock(models_dir);
            Ok(BindPlan::Spawn(desired))
        }
        PortOccupancy::StaleLock(lock) => {
            eprintln!(
                "otoyin: reclaiming port {} from a stale backend (pid {})",
                desired, lock.pid
            );
            clear_owner_lock(models_dir);
            Ok(BindPlan::Spawn(desired))
        }
        PortOccupancy::OursAlive(lock) => {
            // A healthy backend we started is already serving this port.
            // Spawning a second one would only fail with EADDRINUSE.
            eprintln!(
                "otoyin: adopting running backend (pid {}) on port {}",
                lock.pid, desired
            );
            set_current_port_inner(state, desired);
            Ok(BindPlan::Adopt(desired))
        }
        PortOccupancy::Foreign => Err(format!(
            "Port {} is already in use by another program, so the otoyin backend \
             cannot start. Close whatever is using port {} (or set a different \
             port in Settings) and try again.",
            desired, desired
        )),
    }
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
/// NOTE: a bare TCP connect cannot distinguish a healthy backend from a
/// half-dead process squatting the port - never use this alone to decide
/// the backend is usable. Adoption decisions must use `backend_http_ready`.
fn tcp_busy(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("{}:{}", SERVER_HOST, port)
            .parse()
            .unwrap_or_else(|_| "127.0.0.1:8000".parse().unwrap()),
        Duration::from_millis(300),
    )
    .is_ok()
}

/// HTTP readiness probe with a short timeout: true only when the backend
/// actually answers /health/ready. This is the adoption gate - a zombie
/// holding the port (TCP connects, HTTP hangs) must NOT be adopted.
fn backend_http_ready(port: u16) -> bool {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok();
    client
        .as_ref()
        .map(|c| http_ready(c, port))
        .unwrap_or(false)
}

/// Consecutive failed HTTP readiness checks before a hung (but alive)
/// backend is killed and restarted.
const MAX_UNHEALTHY_CHECKS: u32 = 5;
/// Uptime before readiness enforcement starts - imports + first model
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
/// Stop the backend if this app instance started it, and drop the owner lock.
///
/// Two things matter here and both were previously silent:
///
/// 1. `child.kill()` only reaps the direct child. On Windows the backend can
///    hold grandchildren (worker processes), and killing only the parent
///    leaves a process still bound to the port - the "ghost server". Kill the
///    tree instead.
/// 2. Errors were swallowed with `let _ =`, so a failed kill looked exactly
///    like a successful one. They are now logged, because a silent failure here
///    is what strands the user on the next launch.
pub fn stop_if_ours(state: &State<'_, AppState>) {
    // Suppress auto-restart so the monitor thread doesn't respawn it.
    state
        .server
        .auto_restart_disabled
        .store(true, Ordering::SeqCst);
    let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
    if state.server.started_by_us.swap(false, Ordering::SeqCst) {
        if let Some(mut child) = guard.take() {
            let pid = child.id();
            kill_process_tree(pid);
            if let Err(e) = child.wait() {
                eprintln!("otoyin: waiting for backend pid {pid} failed: {e}");
            }
        }
    }
}

/// Terminate `pid` and any descendants.
///
/// Windows: `taskkill /T /F` walks the tree. Unix: start a new process group
/// for the child at spawn time and signal the group (see `spawn_bundled`);
/// without that, fall back to killing the pid alone.
fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        match std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
        {
            Ok(out) if out.status.success() => {}
            Ok(out) => eprintln!(
                "otoyin: taskkill for backend pid {pid} failed: {}",
                String::from_utf8_lossy(&out.stdout).trim()
            ),
            Err(e) => eprintln!("otoyin: could not run taskkill for pid {pid}: {e}"),
        }
    }
    #[cfg(not(windows))]
    {
        // Negative pid targets the process group created in spawn_bundled.
        let _ = std::process::Command::new("kill")
            .arg(format!("-TERM {}", -(pid as i32)))
            .status();
    }
}

/// Drop the owner lock for a data dir the app is shutting down.
pub fn release_ownership(models_dir: &Option<String>) {
    clear_owner_lock(models_dir);
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
///
/// The port is decided by ownership, not by trial and error:
///   * free port / stale lock  -> spawn on the configured port (stable)
///   * our own live backend    -> adopt, spawn nothing
///   * a foreign process       -> fail loudly naming the occupant
///
/// We deliberately do **not** silently walk to the next free port: that
/// desynchronises the frontend from the backend and was the "backend keeps
/// rotating" behaviour. An explicit user-chosen port still wins.
fn spawn_bundled(
    app: &AppHandle,
    models_dir: Option<String>,
    port: Option<u16>,
) -> Result<u16, String> {
    let binary = resolve_binary(app).ok_or_else(|| {
        "bundled backend (otoyin-server) not found -- start it manually (just dev)".to_string()
    })?;

    let desired = resolve_spawn_port(&models_dir, port);

    let port = match plan_bind(desired, &models_dir, &app.state::<AppState>())? {
        BindPlan::Adopt(port) => return Ok(port),
        BindPlan::Spawn(port) => port,
    };
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
    // Own process group on Unix so stop_if_ours can signal the whole
    // tree; without it a killed parent can leave the port held.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn otoyin-server: {e}"))?;

    let out = child.stdout.take();
    let err = child.stderr.take();

    let state = app.state::<AppState>();
    let child_pid = child.id();
    state.set_models_dir(models_dir.clone());
    {
        let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(child);
    }
    state.server.started_by_us.store(true, Ordering::SeqCst);
    // Record ownership before returning, so a crash between spawn and the
    // first health probe still leaves a lock a later launch can act on.
    write_owner_lock(&models_dir, child_pid, port);

    if let Some(out) = out {
        forward_stream(app.clone(), "stdout", out);
    }
    if let Some(err) = err {
        forward_stream(app.clone(), "stderr", err);
    }

    // Spawn auto-restart monitor thread
    spawn_restart_monitor(app.clone(), models_dir, port);

    Ok(port)
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
            // spawns its own monitor - exit instead of touching the new process.
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
                        Err(_) => continue, // Uncertain -- never kill on uncertainty.
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
                // (No unhealthy reset needed - this path always returns
                // after spawning a fresh monitor.)
                let _ = app.emit(
                    "server-log",
                    ServerLogEntry {
                        stream: "stderr".into(),
                        line: "backend unresponsive (readiness failing) -- restarting it"
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
                                "backend crashed {} times -- auto-restart disabled",
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
///
/// Uses the same `plan_bind` ownership decision as `spawn_bundled`, so an
/// auto-restart can never relocate the backend to a different port than the
/// one the frontend is using. It used to keep a private copy of the old
/// `find_free_port(desired + 1)` fallback, so a crash could silently move the
/// backend and desync the UI.
fn spawn_bundled_silent(
    app: &AppHandle,
    models_dir: Option<String>,
    port: Option<u16>,
) -> Result<u16, String> {
    let binary = resolve_binary(app).ok_or_else(|| {
        "bundled backend (otoyin-server) not found -- start it manually (just dev)".to_string()
    })?;

    let desired = resolve_spawn_port(&models_dir, port);

    let port = match plan_bind(desired, &models_dir, &app.state::<AppState>())? {
        BindPlan::Adopt(port) => return Ok(port),
        BindPlan::Spawn(port) => port,
    };
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
    let child_pid = child.id();
    state.set_models_dir(models_dir.clone());
    {
        let mut guard = state.server.child.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(child);
    }
    state.server.started_by_us.store(true, Ordering::SeqCst);
    // Point the owner lock at the new pid; the previous one is dead.
    write_owner_lock(&models_dir, child_pid, port);

    if let Some(out) = out {
        forward_stream(app.clone(), "stdout", out);
    }
    if let Some(err) = err {
        forward_stream(app.clone(), "stderr", err);
    }

    // Spawn a NEW monitor for this new child (replaces the old one that exited).
    spawn_restart_monitor(app.clone(), models_dir, port);

    Ok(port)
}

/// Ensure a local backend is reachable. Adopts an already-running instance
/// (development flow) or spawns the bundled binary when present.
///
/// Adoption requires HTTP readiness, not just a TCP listener: a zombie
/// process squatting the port must never be mistaken for a live backend.
/// When the desired port is busy-but-dead, we spawn on the next free port
/// and return its URL so the frontend follows us there.
pub async fn ensure_started(app: &AppHandle, models_dir: Option<String>) -> Result<String, String> {
    let state = app.state::<AppState>();
    let port = current_port(&state);
    if state.server.started_by_us.load(Ordering::SeqCst) {
        return Ok(server_url(port));
    }
    if backend_http_ready(port) {
        return Ok(server_url(port));
    }
    // Nothing on the port and no binary to launch? Stay quiet in dev - the
    // frontend health banner already tells the user how to start the backend.
    if resolve_binary(app).is_none() {
        return Ok(server_url(port));
    }
    let bound = spawn_bundled(app, models_dir, Some(port))?;
    Ok(server_url(bound))
}

// - Commands -

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
    if state.server.started_by_us.load(Ordering::SeqCst) || backend_http_ready(active_port) {
        return Ok(server_url(active_port));
    }
    match spawn_bundled(&app, models_dir, port) {
        Ok(bound) => Ok(server_url(bound)),
        Err(e) => {
            emit_error(&app, "spawn", e.clone());
            Err(e)
        }
    }
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
    if backend_http_ready(active_port) {
        // Something healthy (re)took the port - adopt it rather than fighting.
        return Ok(server_url(active_port));
    }
    match spawn_bundled(&app, models_dir, port) {
        Ok(bound) => Ok(server_url(bound)),
        Err(e) => {
            emit_error(&app, "spawn", e.clone());
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;



    /// Unique temp data dir per test, so owner-lock tests never collide.
    fn temp_data_dir(tag: &str) -> Option<String> {
        let dir = std::env::temp_dir().join(format!(
            "otoyin-ownerlock-{tag}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.to_str().map(|s| s.to_string())
    }

    /// A port nothing is listening on.
    fn unused_port() -> u16 {
        let held = std::net::TcpListener::bind(format!("{}:0", SERVER_HOST)).unwrap();
        let port = held.local_addr().unwrap().port();
        drop(held);
        port
    }

    #[test]
    fn owner_lock_roundtrips() {
        let dir = temp_data_dir("roundtrip");
        // Our own pid is definitely alive.
        write_owner_lock(&dir, std::process::id(), 17493);
        let lock = read_owner_lock(&dir).expect("lock should be readable");
        assert_eq!(lock.pid, std::process::id());
        assert_eq!(lock.port, 17493);
        clear_owner_lock(&dir);
        assert!(read_owner_lock(&dir).is_none(), "lock must be removable");
    }

    #[test]
    fn inspect_port_reports_free_when_nothing_listens() {
        let dir = temp_data_dir("free");
        let port = unused_port();
        assert!(matches!(
            inspect_port(port, &dir),
            PortOccupancy::Free
        ));
    }

    #[test]
    fn inspect_port_reports_stale_when_lock_pid_is_dead() {
        let dir = temp_data_dir("stale");
        let port = unused_port();
        // Occupy the port so tcp_busy() is true...
        let _squatter = std::net::TcpListener::bind(format!("{}:{}", SERVER_HOST, port)).unwrap();
        // ...with a lock pointing at a pid that cannot exist (u32::MAX).
        write_owner_lock(&dir, u32::MAX, port);
        match inspect_port(port, &dir) {
            PortOccupancy::StaleLock(lock) => {
                assert_eq!(lock.pid, u32::MAX);
                assert_eq!(lock.port, port);
            }
            other => panic!("expected StaleLock, got {other:?}"),
        }
    }

    #[test]
    fn inspect_port_reports_foreign_without_a_lock() {
        let dir = temp_data_dir("foreign");
        let port = unused_port();
        // Port held, but no owner lock => somebody else's process.
        let _squatter = std::net::TcpListener::bind(format!("{}:{}", SERVER_HOST, port)).unwrap();
        assert!(matches!(
            inspect_port(port, &dir),
            PortOccupancy::Foreign
        ));
    }

    #[test]
    fn plan_bind_rejects_a_foreign_port_instead_of_rotating() {
        let dir = temp_data_dir("norotate");
        let port = unused_port();
        let _squatter = std::net::TcpListener::bind(format!("{}:{}", SERVER_HOST, port)).unwrap();
        let state = AppState::default();
        // A foreign occupant must be reported, never silently relocated.
        let err = plan_bind(port, &dir, &state).expect_err("must not plan a bind");
        assert!(
            err.contains("already in use by another program"),
            "error should name the conflict, got: {err}"
        );
    }

    #[test]
    fn stale_lock_is_reclaimed_on_the_same_port() {
        let dir = temp_data_dir("reclaim");
        let port = unused_port();
        write_owner_lock(&dir, u32::MAX, port);
        let state = AppState::default();
        // Port itself is free; the stale record must not push us elsewhere.
        match plan_bind(port, &dir, &state).expect("stale lock should be reclaimable") {
            BindPlan::Spawn(bound) => assert_eq!(bound, port),
            BindPlan::Adopt(bound) => panic!("nothing is running; must spawn, not adopt ({bound})"),
        }
        assert!(
            read_owner_lock(&dir).is_none(),
            "the stale lock must be cleared before spawning"
        );
    }

    /// Body of the function whose signature contains `signature`, with comments
    /// stripped.
    ///
    /// Brace-matched rather than "up to the next `\nfn `": several functions
    /// here are `pub async fn` or carry attributes, so a naive boundary search
    /// runs past the end of the function and picks up later code (including this
    /// very test module).
    ///
    /// Comments are stripped because the doc comments on the spawn functions
    /// deliberately name the removed `find_free_port` helper while explaining
    /// why it had to go.
    fn fn_body(signature: &str) -> String {
        let src = include_str!("server.rs");
        let start = src
            .find(signature)
            .unwrap_or_else(|| panic!("{signature} should exist"));
        let open = src[start..]
            .find('{')
            .unwrap_or_else(|| panic!("{signature} should have a body"));
        let body_start = start + open;

        let mut depth = 0usize;
        let mut end = src.len();
        for (i, ch) in src[body_start..].char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = body_start + i;
                        break;
                    }
                }
                _ => {}
            }
        }
        strip_line_comments(&src[body_start..end])
    }

    fn strip_line_comments(text: &str) -> String {
        text.lines()
            .map(|l| match l.find("//") {
                Some(i) => &l[..i],
                None => l,
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn no_spawn_path_silently_rotates_the_port() {
        // `find_free_port` used to be called by both spawn paths, which is how
        // a crashed backend could end up on a different port than the frontend
        // was told about. The helper is gone; assert neither spawn path can
        // reintroduce port-hopping behind the user's back.
        for name in ["fn spawn_bundled(", "fn spawn_bundled_silent("] {
            let body = fn_body(name);
            assert!(
                !body.contains("find_free_port"),
                "{name} must not rotate the port"
            );
            assert!(
                !body.contains("saturating_add(1)"),
                "{name} must not walk to the next port"
            );
        }
    }

    
}
