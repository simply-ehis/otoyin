//! Whole-drive free-space check for the onboarding models step.
//!
//! The frontend needs this to warn before someone downloads multi-GB voice
//! and audio models onto a full disk. It reports the disk that contains the
//! models directory (passed in from the renderer, which knows the backend's
//! `getModelsCacheDir()` path), falling back to the app data directory.
//!
//! Command:
//!   get_disk_space { path?: string } -> { mountPoint, totalBytes, freeBytes }

use serde::Serialize;
use std::path::{Path, PathBuf};
use sysinfo::{Disk, Disks};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceReport {
    /// Mount point / drive root of the measured disk (e.g. `C:\`).
    pub mount_point: String,
    /// Total size of the disk in bytes.
    pub total_bytes: u64,
    /// Bytes currently free on the disk.
    pub free_bytes: u64,
}

/// Longest mount-point prefix of `path` within the refreshed disk list.
fn disk_for_path<'a>(disks: &'a Disks, path: &Path) -> Option<&'a Disk> {
    let mut best: Option<&'a Disk> = None;
    let mut best_len = 0usize;
    for disk in disks.iter() {
        let mount = disk.mount_point();
        if path.starts_with(mount) {
            let len = mount.as_os_str().len();
            if len >= best_len {
                best = Some(disk);
                best_len = len;
            }
        }
    }
    best
}

#[tauri::command]
pub fn get_disk_space(
    app: AppHandle,
    path: Option<String>,
) -> Result<DiskSpaceReport, String> {
    let target: PathBuf = match path.as_deref().map(str::trim) {
        Some(raw) if !raw.is_empty() => PathBuf::from(raw),
        _ => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    let disks = Disks::new_with_refreshed_list().map_err(|e| format!("{e:?}"))?;
    let disk = disk_for_path(&disks, &target)
        .or_else(|| disks.iter().next())
        .ok_or_else(|| "no disks detected".to_string())?;
    Ok(DiskSpaceReport {
        mount_point: disk.mount_point().to_string_lossy().into_owned(),
        total_bytes: disk.total_space(),
        free_bytes: disk.available_space(),
    })
}
