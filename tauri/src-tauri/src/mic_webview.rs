//! Windows WebView2 microphone permission shim.
//!
//! WRY (Tauri's WebView2 backend) does not automatically grant microphone
//! permissions on Windows — the `PermissionRequested` event must be handled
//! explicitly. On Windows 10 1803+ mic access is granted to desktop apps
//! when enabled in Settings → Privacy → Microphone. On Windows 11 the
//! WebView2 Chromium engine shows a per-site permission prompt.
//!
//! On macOS the Info.plist `NSMicrophoneUsageDescription` + entitlement
//! `com.apple.security.device.audio-input` handle permission; on Linux
//! WebKitGTK uses its own portal/permission flow.
//!
//! TODO: When WebView2 COM features are added to the `windows` crate deps,
//! implement the `PermissionRequested → ALLOW` handler on the
//! `ICoreWebView2Controller` to auto-grant mic access without user prompt.

use std::sync::Once;

static INIT: Once = Once::new();

/// Initialize the microphone permission handler.
/// Call once during app startup (in lib.rs setup).
pub fn init_mic_permission_handler() {
    INIT.call_once(|| {
        #[cfg(windows)]
        {
            eprintln!(
                "[mic_webview] Windows mic permission: ensure Settings → Privacy → \
                 Microphone → 'Allow desktop apps to access your microphone' is ON. \
                 WebView2 (Chromium) shows its own per-site prompt on first use."
            );
        }
        #[cfg(target_os = "macos")]
        {
            eprintln!(
                "[mic_webview] macOS mic permission: handled via Info.plist entitlements. \
                 First recording attempt triggers the system permission dialog."
            );
        }
        #[cfg(target_os = "linux")]
        {
            eprintln!(
                "[mic_webview] Linux mic permission: WebKitGTK uses XDG Desktop Portal \
                 or PipeWire for microphone access."
            );
        }
    });
}
