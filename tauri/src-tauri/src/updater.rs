//! Pending-update application for the "Later installs on quit" flow (§6).
//!
//! The frontend marks a downloaded update as pending-install via
//! `updater_set_pending_install(true)` (UpdateBanner's "Later" handler, which
//! only fires when a download finished). On window close — CloseRequested,
//! which already stops the bundled backend before destroying the window —
//! if an update is pending we check() and download it and install it instead
//! of closing. On Windows the NSIS installer replaces the app and the
//! process exits during install (ShellExecute + process::exit(0) inside the
//! plugin); the installer relaunches the app afterwards. On other platforms
//! the caller destroys the window and the user relaunches to run the new
//! version. A failed install keeps the current version and closes normally
//! — never nag, never brick.
//!
//! Not called for ordinary closes: nothing happens unless the user chose
//! "Later".

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Check for an update and install it if one exists.
///
/// Returns `Ok(())` when the install was kicked off (Windows: process is
/// about to exit inside the plugin) or completed. Returns `Err` for check
/// or install failures - the caller keeps the current version.
///
/// A stalled network would otherwise hang the window close forever (the
/// CloseRequested path spawns this without any other escape hatch), so the
/// whole check+download+install is bounded: on timeout the caller closes
/// normally with the current version, never nags.
pub async fn install_pending_update(app: &AppHandle) -> Result<(), String> {
    match tokio::time::timeout(
        std::time::Duration::from_secs(300),
        install_pending_update_inner(app),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(
            "update install timed out after 5 minutes - kept the current version"
                .to_string(),
        ),
    }
}

async fn install_pending_update_inner(app: &AppHandle) -> Result<(), String> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| format!("updater could not be built: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?
        .ok_or_else(|| "no update available".to_string())?;
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("update install failed: {e}"))?;
    Ok(())
}
