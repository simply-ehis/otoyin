import { useAutoUpdater } from "@/hooks/useAutoUpdater";

/**
 * App-shell host for the auto-update flow (mounted once, next to `<Toaster />`).
 *
 * On desktop (Tauri) this checks for updates on launch and drives the full
 * toast UX: "Update Available" → download progress → "Restart Now". On web the
 * platform updater is a no-op (`metadata.isTauri === false`), so mounting it
 * unconditionally is safe and renders nothing.
 */
export function AutoUpdateFlow() {
	useAutoUpdater({ checkOnMount: true, showToast: true });
	return null;
}
