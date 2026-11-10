/// otoyin desktop shell.
///
/// Thin Tauri container around the studio UI. On desktop it:
/// - registers dialog/fs/process/shell/updater plugins,
/// - auto-launches the bundled Python backend (or adopts one already
///   running, e.g. `just dev`) so the window opens against a live server,
/// - exposes the server-lifecycle and system-audio commands the frontend
///   platform layer invokes, and
/// - coordinates window close with the renderer (stop the backend unless the
///   user chose "keep running after close").
mod audio;
#[cfg(target_os = "macos")]
mod audio_mac;
#[cfg(windows)]
mod audio_win;
#[cfg(feature = "rust-backend")]
mod backend;
mod mic_webview;
mod server;
mod settings;
mod window_state;

use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Shared application state handed to commands via `tauri::State`.
#[derive(Default)]
pub(crate) struct AppState {
    pub server: server::ServerState,
    pub audio: audio::AudioState,
}

/// Crash log cap: rotate instead of growing without bound.
const CRASH_LOG_MAX_BYTES: u64 = 256 * 1024;

/// Write a panic entry to the given log path, rotating if over the size cap.
/// Extracted so it can be unit-tested without a Tauri AppHandle.
fn write_panic_to_log(
    log_path: &std::path::Path,
    info: &std::panic::PanicHookInfo,
) -> Result<(), String> {
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if std::fs::metadata(log_path).map(|m| m.len()).unwrap_or(0) > CRASH_LOG_MAX_BYTES {
        let rotated = log_path.with_extension("log.1");
        let _ = std::fs::remove_file(&rotated);
        std::fs::rename(log_path, &rotated).map_err(|e| e.to_string())?;
    }
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    writeln!(
        file,
        "--- panic at {:?} ---\n{}",
        std::time::SystemTime::now(),
        info
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn install_panic_hook(app: &tauri::AppHandle) {
    // Rust panics are otherwise invisible on user machines: persist them to
    // `crashes.log` in the app-data dir so users can attach them to bug
    // reports (Settings → Contact & support). No network, no new crates.
    let log_path = app
        .path()
        .app_data_dir()
        .map(|dir| dir.join("crashes.log"))
        .unwrap_or_else(|_| std::env::temp_dir().join("otoyin-crashes.log"));
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Keep default behavior (stderr) AND persist to file.
        default_hook(info);
        if let Err(e) = write_panic_to_log(&log_path, info) {
            eprintln!("crash log write failed: {}", e);
        }
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new().build(),
        )
        .invoke_handler(tauri::generate_handler![
            backend::start_rust_backend,
            server::start_server,
            server::stop_server,
            server::restart_server,
            settings::settings_read,
            settings::settings_write,
            settings::credential_set,
            settings::credential_get,
            settings::credential_delete,
            audio::is_system_audio_supported,
            audio::start_system_audio_capture,
            audio::stop_system_audio_capture,
            audio::list_audio_output_devices,
            audio::list_mic_input_devices,
            audio::start_mic_capture,
            audio::stop_mic_capture,
            audio::play_audio_to_devices,
            audio::stop_audio_playback,
        ])
        .setup(|app| {
            app.manage(AppState::default());
            install_panic_hook(app.handle());
            // Fit the window into the usable desktop and restore the
            // user's last geometry (never larger than the work area).
            window_state::apply_startup_geometry(app.handle());
            #[cfg(desktop)]
            {
                // Log platform-specific mic permission guidance
                mic_webview::init_mic_permission_handler();

                // Global dictation chord: Control + Alt + D toggles the capture pill.
                // Fires a tauri event the frontend listens for to show/hide the
                // pill and start/stop recording — no frontend polling required.
                let handle = app.handle().clone();
                app.global_shortcut()
                    .on_shortcut("Control+Alt+D", move |_app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.emit("dictation:toggle", ());
                            }
                        }
                    })?;

                // Start the bundled backend before the UI begins polling
                // /health. Non-fatal: in dev the backend is usually already
                // running (adopted), and without a bundled binary we stay
                // silent and let the UI health banner guide the user.
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = server::ensure_started(&handle, None).await;
                });

                // Rust backend (Phase 1): start health-check server on a
                // separate port for gradual migration. Non-fatal.
                #[cfg(feature = "rust-backend")]
                tauri::async_runtime::spawn(async move {
                    let _ = backend::start_rust_backend(Some(17494));
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            window_state::handle_window_event(window, event);
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Closing the app always stops the backend we started.
                //
                // This used to depend on a renderer round-trip: Rust asked the
                // webview for permission, and a second handler in the webview
                // (`win.onCloseRequested`) also called `preventDefault()` and
                // fired a fire-and-forget `stop_server`. Two handlers racing on
                // one event, with the kill wrapped in `catch {}`, meant a close
                // could complete while the backend survived — which is exactly
                // the orphaned `otoyin-server.exe` that kept squatting port
                // 17493 across launches. The kill is now unconditional, on the
                // Rust side, before the window is allowed to close.
                api.prevent_close();
                let state = window.state::<AppState>();
                let already = state.server.close_in_progress.swap(true, Ordering::SeqCst);
                if !already {
                    let handle = window.app_handle().clone();
                    // Stop first, then close. Synchronous so the child is gone
                    // before the process can exit and orphan it.
                    server::stop_if_ours(&state);
                    server::release_ownership(&handle.state::<AppState>().models_dir());
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.destroy();
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // Any exit path (Cmd+Q, crash, window close) must not strand the
        // backend. Same rule as window close: always stop what we started.
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<AppState>();
            server::stop_if_ours(&state);
            server::release_ownership(&state.models_dir());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: install a test panic hook that writes to `log_path`, trigger a
    /// panic, catch it, restore the original hook, and return the log path.
    fn trigger_test_panic(log_path: &std::path::Path, msg: &str) {
        let lp = log_path.to_path_buf();
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            default_hook(info);
            let _ = write_panic_to_log(&lp, info);
        }));

        let result = std::panic::catch_unwind(|| {
            panic!("{}", msg);
        });

        assert!(result.is_err(), "should have caught the panic");
    }

    #[test]
    fn panic_hook_writes_to_log_file() {
        let dir = std::env::temp_dir().join("otoyin-crash-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("crashes.log");

        trigger_test_panic(
            &log_path,
            "deliberate test panic for crash log verification",
        );

        assert!(
            log_path.exists(),
            "crash log file should exist at {}",
            log_path.display()
        );
        let contents = std::fs::read_to_string(&log_path).unwrap();
        assert!(
            contents.contains("deliberate test panic"),
            "log should contain the panic message, got: {}",
            &contents[..contents.len().min(200)]
        );
        assert!(
            contents.contains("--- panic at"),
            "log should have the timestamp header"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn panic_log_rotates_at_max_size() {
        let dir = std::env::temp_dir().join("otoyin-crash-rotate-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let log_path = dir.join("crashes.log");

        // Fill the log to just over CRASH_LOG_MAX_BYTES
        let oversized = vec![b'x'; (CRASH_LOG_MAX_BYTES as usize) + 100];
        std::fs::write(&log_path, &oversized).unwrap();
        let original_size = std::fs::metadata(&log_path).unwrap().len();
        assert!(original_size > CRASH_LOG_MAX_BYTES);

        trigger_test_panic(&log_path, "rotation test panic");

        // The original oversized file should have been rotated to .log.1
        let rotated = log_path.with_extension("log.1");
        assert!(
            rotated.exists(),
            "rotated file should exist at {}",
            rotated.display()
        );

        // The new log should contain our panic message
        let contents = std::fs::read_to_string(&log_path).unwrap();
        assert!(contents.contains("rotation test panic"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn panic_log_creates_parent_dirs() {
        let dir = std::env::temp_dir().join("otoyin-crash-nested-test");
        let _ = std::fs::remove_dir_all(&dir);
        let log_path = dir.join("sub").join("dir").join("crashes.log");

        trigger_test_panic(&log_path, "nested dir test panic");

        assert!(log_path.exists());
        let contents = std::fs::read_to_string(&log_path).unwrap();
        assert!(contents.contains("nested dir test panic"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
