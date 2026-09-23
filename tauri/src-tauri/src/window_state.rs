//! Adaptive window geometry: fit the usable desktop, remember the user.
//!
//! Two guarantees: the app never spawns larger than the monitor work area
//! (frameless Windows windows can otherwise open under the taskbar), the
//! fresh size is a fraction of the user's own work area (never a fixed box
//! for one device), and the user's last size/position is restored on launch. No new dependencies —
//! persistence is one JSON file, the work area comes from win32 on Windows
//! and the Tauri monitor size elsewhere. The app never auto-maximizes.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewWindow, WindowEvent};

const MAX_DEFAULT_WIDTH: f64 = 1400.0;
const MAX_DEFAULT_HEIGHT: f64 = 900.0;
const MIN_WIDTH: f64 = 800.0;
const MIN_HEIGHT: f64 = 600.0;
/// Fraction of the work area a fresh window takes. The default size is
/// derived from the user's own monitor, never a fixed pixel box.
const DEFAULT_WIDTH_FRAC: f64 = 0.82;
const DEFAULT_HEIGHT_FRAC: f64 = 0.84;
/// Fallback margin when no OS work-area API is available.
const FALLBACK_MARGIN: f64 = 0.92;
const STATE_FILE: &str = "window-state.json";
const SAVE_DEBOUNCE_MS: u128 = 500;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct SavedGeometry {
    width: f64,
    height: f64,
    x: f64,
    y: f64,
}

/// Usable rectangle in logical pixels.
#[derive(Debug, Clone, Copy)]
struct WorkArea {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Clamp a size into [MIN, max].
pub fn clamp_size(width: f64, height: f64, max_w: f64, max_h: f64) -> (f64, f64) {
    (
        width.max(MIN_WIDTH).min(max_w.max(MIN_WIDTH)),
        height.max(MIN_HEIGHT).min(max_h.max(MIN_HEIGHT)),
    )
}

/// Preferred fresh-window size for `area`: a fraction of the usable desktop,
/// clamped to [MIN, MAX_DEFAULT]. Small screens get a fitting window, large
/// screens get the full preferred size — nothing hardcoded to one device.
pub fn default_size(area: &WorkArea) -> (f64, f64) {
    clamp_size(
        (area.w * DEFAULT_WIDTH_FRAC).min(MAX_DEFAULT_WIDTH),
        (area.h * DEFAULT_HEIGHT_FRAC).min(MAX_DEFAULT_HEIGHT),
        area.w,
        area.h,
    )
}
/// Top-left that centers (w, h) inside `area`.
pub fn centered(area: &WorkArea, w: f64, h: f64) -> (f64, f64) {
    (area.x + (area.w - w) / 2.0, area.y + (area.h - h) / 2.0)
}

/// True when the rect intersects any of the given monitor rects.
pub fn rect_visible(x: f64, y: f64, w: f64, h: f64, monitors: &[(f64, f64, f64, f64)]) -> bool {
    monitors
        .iter()
        .any(|(mx, my, mw, mh)| x < mx + mw && x + w > mx && y < my + mh && y + h > my)
}

/// Work area (taskbar excluded) of the monitor the window is on, in logical
/// pixels. Uses the window's own position so multi-monitor setups resolve to
/// the right screen; falls back to the nearest monitor when that fails.
#[cfg(windows)]
fn primary_work_area(window: &WebviewWindow, scale: f64) -> Option<WorkArea> {
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITORINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        MonitorFromPoint, MONITOR_DEFAULTTONEAREST, POINT,
    };

    let pos = window.outer_position().ok()?;
    let point = POINT { x: pos.x, y: pos.y };
    unsafe {
        let monitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);
        if monitor.is_invalid() {
            return None;
        }
        let mut info = MONITORINFO::default();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        let r = info.rcWork;
        let scale = if scale > 0.0 { scale } else { 1.0 };
        // A zero rect means the call gave us nothing usable.
        if r.right <= r.left || r.bottom <= r.top {
            return None;
        }
        Some(WorkArea {
            x: r.left as f64 / scale,
            y: r.top as f64 / scale,
            w: (r.right - r.left) as f64 / scale,
            h: (r.bottom - r.top) as f64 / scale,
        })
    }
}

/// Usable area for `window`'s monitor: real work area on Windows, the full
/// monitor minus a margin elsewhere.
fn work_area_for_window(window: &WebviewWindow) -> Option<WorkArea> {
    #[cfg(windows)]
    {
        let scale = window.scale_factor().unwrap_or(1.0);
        if let Some(area) = primary_work_area(window, scale) {
            return Some(area);
        }
    }
    let monitor = window.primary_monitor().ok()??;
    let scale = monitor.scale_factor().unwrap_or(1.0);
    let size = monitor.size().ok()?;
    let position = monitor.position().ok()?;
    let (w, h) = (
        size.width as f64 / scale * FALLBACK_MARGIN,
        size.height as f64 / scale * FALLBACK_MARGIN,
    );
    Some(WorkArea {
        x: position.x as f64 / scale + (size.width as f64 / scale - w) / 2.0,
        y: position.y as f64 / scale + (size.height as f64 / scale - h) / 2.0,
        w,
        h,
    })
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join(STATE_FILE))
}

fn load_saved(app: &AppHandle) -> Option<SavedGeometry> {
    let path = state_path(app)?;
    let text = std::fs::read_to_string(path).ok()?;
    let geo: SavedGeometry = serde_json::from_str(&text).ok()?;
    if !geo.width.is_finite() || !geo.height.is_finite() || !geo.x.is_finite() || !geo.y.is_finite() {
        return None;
    }
    Some(geo)
}

fn save(app: &AppHandle, geo: &SavedGeometry) {
    if let Some(path) = state_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string(geo) {
            let _ = std::fs::write(path, text);
        }
    }
}

fn current_geometry(window: &WebviewWindow) -> Option<SavedGeometry> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some(SavedGeometry {
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
    })
}

fn last_save() -> &'static Mutex<Instant> {
    static CELL: OnceLock<Mutex<Instant>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(Instant::now() - std::time::Duration::from_secs(3600)))
}

/// Persist on move/resize (throttled). Also pulls a maximized frameless
/// window back inside the work area — that state is what underlaps the
/// taskbar, and it must never be what we restore next launch.
pub fn note_geometry_changed(window: &WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        if let Some(area) = work_area_for_window(window) {
            let scale = window.scale_factor().unwrap_or(1.0);
            if let Ok(size) = window.outer_size() {
                let (w, h) = (size.width as f64 / scale, size.height as f64 / scale);
                if w > area.w + 1.0 || h > area.h + 1.0 {
                    let (cw, ch) = clamp_size(area.w, area.h, area.w, area.h);
                    let (cx, cy) = centered(&area, cw, ch);
                    let _ = window.unmaximize();
                    let _ = window.set_size(Size::Logical(LogicalSize {
                        width: cw,
                        height: ch,
                    }));
                    let _ = window.set_position(Position::Logical(LogicalPosition { x: cx, y: cy }));
                    return;
                }
            }
        }
    }
    let now = Instant::now();
    if let Ok(mut last) = last_save().lock() {
        if now.duration_since(*last).as_millis() < SAVE_DEBOUNCE_MS {
            return;
        }
        *last = now;
    }
    if let Some(geo) = current_geometry(window) {
        save(&window.app_handle(), &geo);
    }
}

/// Save right now (window close path).
pub fn save_now(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            return; // Never persist the maximized state (see above).
        }
        if let Some(geo) = current_geometry(&window) {
            save(app, &geo);
        }
    }
}

/// Size the main window at startup: restore the user's geometry when it is
/// still sane, otherwise fit the default size into the work area centered.
/// Never maximizes.
pub fn apply_startup_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let area = match work_area_for_window(&window) {
        Some(area) => area,
        None => return, // Leave the configured default alone.
    };
    if let Some(saved) = load_saved(app) {
        let (w, h) = clamp_size(saved.width, saved.height, area.w, area.h);
        // Accept the saved rect only if it lands on a real monitor.
        let monitors: Vec<(f64, f64, f64, f64)> = app
            .available_monitors()
            .unwrap_or_default()
            .iter()
            .filter_map(|m| {
                let scale = m.scale_factor().unwrap_or(1.0);
                let size = m.size().ok()?;
                let pos = m.position().ok()?;
                Some((
                    pos.x as f64 / scale,
                    pos.y as f64 / scale,
                    size.width as f64 / scale,
                    size.height as f64 / scale,
                ))
            })
            .collect();
        let visible = monitors.is_empty() || rect_visible(saved.x, saved.y, w, h, &monitors);
        if visible {
            // Re-clamp position inside the work area so an unplugged-monitor
            // restore can't strand the window off-screen.
            let x = saved.x.max(area.x).min((area.x + area.w - w).max(area.x));
            let y = saved.y.max(area.y).min((area.y + area.h - h).max(area.y));
            let _ = window.set_size(Size::Logical(LogicalSize { width: w, height: h }));
            let _ = window.set_position(Position::Logical(LogicalPosition { x, y }));
            return;
        }
    }
    let (w, h) = default_size(&area);
    let (x, y) = centered(&area, w, h);
    let _ = window.set_size(Size::Logical(LogicalSize { width: w, height: h }));
    let _ = window.set_position(Position::Logical(LogicalPosition { x, y }));
}

/// Route window events into the geometry tracker. Call from the app's
/// `on_window_event` handler.
pub fn handle_window_event(window: &WebviewWindow, event: &WindowEvent) {
    match event {
        WindowEvent::Resized(_) | WindowEvent::Moved(_) => note_geometry_changed(window),
        WindowEvent::CloseRequested { .. } => save_now(&window.app_handle()),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_keeps_sane_sizes() {
        assert_eq!(clamp_size(1400.0, 900.0, 1920.0, 1040.0), (1400.0, 900.0));
        assert_eq!(clamp_size(3000.0, 2000.0, 1920.0, 1040.0), (1920.0, 1040.0));
        assert_eq!(clamp_size(100.0, 100.0, 1920.0, 1040.0), (800.0, 600.0));
    }

    #[test]
    fn default_size_scales_with_device() {
        // 1080p work area: preferred size, not full screen.
        let area = WorkArea { x: 0.0, y: 0.0, w: 1920.0, h: 1040.0 };
        let (w, h) = default_size(&area);
        assert!((w - 1400.0).abs() < 1e-6);
        assert!((h - 1040.0 * 0.84).abs() < 1e-6);
        // Small laptop: fits inside the work area, never the fixed 1400x900.
        let small = WorkArea { x: 0.0, y: 0.0, w: 1366.0, h: 728.0 };
        let (w, h) = default_size(&small);
        assert!(w <= small.w && h <= small.h);
        assert!((w - 1366.0 * 0.82).abs() < 1e-6);
    }

    #[test]
    fn centering_math() {
        let area = WorkArea { x: 0.0, y: 0.0, w: 1920.0, h: 1040.0 };
        assert_eq!(centered(&area, 1400.0, 900.0), (260.0, 70.0));
    }

    #[test]
    fn visibility_check() {
        let monitors = vec![(0.0, 0.0, 1920.0, 1080.0)];
        assert!(rect_visible(100.0, 100.0, 800.0, 600.0, &monitors));
        assert!(!rect_visible(2000.0, 100.0, 800.0, 600.0, &monitors));
        // Touching the edge still counts as visible.
        assert!(rect_visible(1900.0, 100.0, 800.0, 600.0, &monitors));
    }

    #[test]
    fn saved_geometry_roundtrips() {
        let geo = SavedGeometry { width: 1400.0, height: 900.0, x: 260.0, y: 70.0 };
        let text = serde_json::to_string(&geo).unwrap();
        let back: SavedGeometry = serde_json::from_str(&text).unwrap();
        assert_eq!((back.width, back.height, back.x, back.y), (1400.0, 900.0, 260.0, 70.0));
        assert!(serde_json::from_str::<SavedGeometry>("not json").is_err());
    }
}
