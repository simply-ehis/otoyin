/**
 * Settings persistence bridge to Tauri.
 *
 * `settings_read` / `settings_write` are Rust commands that read and
 * atomically write `settings.json` in the app data directory. When Tauri is
 * not available (tests, browser dev mode) the calls degrade gracefully so
 * the store still works with in-memory defaults.
 */

import { invoke } from "@tauri-apps/api/core";

export interface ReadSettingsResult {
	values: Record<string, unknown>;
	/** True when settings.json existed but could not be parsed (a .bak copy is kept). */
	corrupted: boolean;
}

function isCorruptError(error: unknown): boolean {
	// settings_read tags its corruption error with a stable marker so the UI can
	// distinguish "file is broken (backed up, defaults in effect)" from "Tauri is absent".
	return String(error ?? "").includes("settings_corrupt");
}

/** Read the whole settings object. `values` is `{}` when unavailable; `corrupted`
 * tells the caller the file was broken (a settings.json.bak is kept). */
export async function readSettings(): Promise<ReadSettingsResult> {
	try {
		const result = await invoke<Record<string, unknown>>("settings_read");
		return { values: result ?? {}, corrupted: false };
	} catch (error) {
		return { values: {}, corrupted: isCorruptError(error) };
	}
}

/** Write a single setting value. Failures are reported via console — in-memory
 * state still updates; persistence retries on the next write. */
export async function writeSetting(key: string, value: unknown): Promise<void> {
	try {
		await invoke("settings_write", { key, value });
	} catch (error) {
		// Outside Tauri this call rejects permanently; an explicit warn keeps
		// real persistence failures (disk, locks, corrupt-file-on-disk) from
		// vanishing silently instead of surfacing them on every boot.
		console.warn("[settings] writeSetting failed for", key, error);
	}
}
