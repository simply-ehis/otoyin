/**
 * download.ts — Trigger a browser file download from a Blob.
 *
 * PURPOSE: Single canonical download helper for every export/download in the app.
 * OWNS: downloadBlob()
 * READ-WHEN: any export, download, or save-to-disk action.
 * KEY-FILES: standalone export, stories export, audio export, dubbing, platform export
 * INVARIANTS: always revoke the object URL; filename always has an extension.
 * GOTCHAS: IE11 unsupported (Tauri only — not a concern).
 * UPDATED: 2026-09-08
 */

/**
 * Trigger a browser file download from a Blob.
 * Creates an object URL, injects a temporary <a>, clicks it, then revokes.
 *
 * @param blob     The Blob to download
 * @param filename The filename to suggest (must include extension)
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
