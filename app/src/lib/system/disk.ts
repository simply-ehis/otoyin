/**
 * Disk space bridge to Tauri.
 *
 * `get_disk_space` is a Rust command backed by the `sysinfo` crate; it reports
 * the disk that contains the given path (the backend's model cache directory),
 * or the Tauri app data directory when no path is passed. When Tauri is not
 * available (tests, browser dev mode) the call degrades to `null` and the UI
 * simply omits the disk row rather than inventing numbers.
 */

import { invoke } from "@tauri-apps/api/core";

export interface DiskSpaceReport {
	/** Mount point / drive root of the measured disk (e.g. `C:\\`). */
	mountPoint: string;
	/** Total size of the disk in bytes. */
	totalBytes: number;
	/** Bytes currently free on the disk. */
	freeBytes: number;
}

function isValidReport(r: unknown): r is DiskSpaceReport {
	if (!r || typeof r !== "object") {
		return false;
	}
	const { mountPoint, totalBytes, freeBytes } = r as Record<string, unknown>;
	return (
		typeof mountPoint === "string" &&
		typeof totalBytes === "number" &&
		Number.isFinite(totalBytes) &&
		totalBytes >= 0 &&
		typeof freeBytes === "number" &&
		Number.isFinite(freeBytes) &&
		freeBytes >= 0
	);
}

/** Free/total bytes on the disk holding `path` (falls back to the app data
 * drive). Returns null without Tauri or on any failure. */
export async function getDiskSpace(
	path?: string | null,
): Promise<DiskSpaceReport | null> {
	try {
		const report = await invoke<unknown>("get_disk_space", {
			path: path ?? null,
		});
		return isValidReport(report) ? report : null;
	} catch {
		return null;
	}
}

const GIB = 1024 * 1024 * 1024;

/** Human label for a byte count, e.g. `1.5 GB` or `340 MB`. */
export function formatBytes(bytes: number): string {
	if (bytes >= GIB) {
		return `${(bytes / GIB).toFixed(1)} GB`;
	}
	return `${Math.round(bytes / (1024 * 1024))} MB`;
}
