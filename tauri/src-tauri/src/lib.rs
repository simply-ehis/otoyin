/// Tauri shell for otoyin — thin desktop container.
///
/// The heavy lifting (Python backend sidecar, audio engine commands) is wired
/// in a separate task; this entry keeps the shell minimal and compiling:
/// window, dialog/fs/shell/process plugins, and the auto-updater plugin so the
/// JS update flow (`@tauri-apps/plugin-updater` via `tauri/src/platform/updater.ts`)
/// has a registered counterpart on the Rust side.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Endpoints + pubkey come from `plugins.updater` in tauri.conf.json.
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())
                    .expect("failed to register updater plugin");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
