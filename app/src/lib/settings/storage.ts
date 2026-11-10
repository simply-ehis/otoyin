/**
 * Settings persistence bridge to Tauri.
 *
 * `settings_read` / `settings_write` are Rust commands that read and
 * atomically write `settings.json` in the app data directory. When Tauri is
 * not available (tests, browser dev mode) the calls degrade gracefully so
 * the store still works with in-memory defaults.
 */

import { invoke } from "@tauri-apps/api/core";

/** Read the whole settings object. Returns `{}` when Tauri isn't available. */
export async function readSettings(): Promise<Record<string, unknown>> {
	try {
		const result = await invoke<Record<string, unknown>>("settings_read");
		return result ?? {};
	} catch {
		return {};
	}
}

/** Write a single setting value. No-op when Tauri isn't available. */
export async function writeSetting(key: string, value: unknown): Promise<void> {
	try {
		await invoke("settings_write", { key, value });
	} catch {
		// Not running under Tauri — local state still updates so the UI stays
		// consistent; the value persists once Tauri is available.
	}
}
