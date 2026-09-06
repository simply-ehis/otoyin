/**
 * Tauri platform implementation.
 *
 * The updater is the real one: it drives `tauri-plugin-updater` end-to-end
 * (plugin registered in `tauri/src-tauri/src/lib.rs`, configured with
 * endpoints + public key in `tauri.conf.json`, artifacts produced by CI via
 * `createUpdaterArtifacts`). Everything else in the `Platform` interface
 * keeps the web fallbacks, which behave fine inside the Tauri webview.
 *
 * Flow: `checkForUpdates()` → `check()`; if an update exists, the Settings
 * "Check for updates" row and the launch toast expose Download →
 * progress → Restart (`restartAndInstall()` → `relaunch()`, needed on
 * macOS/Linux; Windows exits during install and relaunches itself).
 */
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { Platform, UpdateStatus } from "./types";
import { webPlatform } from "./webPlatform";

let currentUpdate: Update | null = null;

let status: UpdateStatus = {
	checking: false,
	available: false,
	downloading: false,
	installing: false,
	readyToInstall: false,
};

const listeners = new Set<(next: UpdateStatus) => void>();

function setStatus(patch: Partial<UpdateStatus>): void {
	status = { ...status, ...patch };
	for (const listener of listeners) {
		listener(status);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const tauriPlatform: Platform = {
	...webPlatform,
	updater: {
		getStatus: () => status,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		checkForUpdates: async () => {
			if (status.checking) {
				return;
			}
			setStatus({ checking: true, error: undefined });
			try {
				const update = await check();
				currentUpdate = update;
				setStatus(
					update
						? {
								checking: false,
								available: true,
								version: update.version,
								downloading: false,
								readyToInstall: false,
							}
						: {
								checking: false,
								available: false,
								version: undefined,
								downloading: false,
								readyToInstall: false,
							},
				);
			} catch (error) {
				currentUpdate = null;
				setStatus({
					checking: false,
					available: false,
					version: undefined,
					error: errorMessage(error),
				});
			}
		},
		downloadAndInstall: async () => {
			const update = currentUpdate;
			if (!update || status.downloading) {
				return;
			}
			setStatus({ downloading: true, error: undefined });
			try {
				let contentLength: number | undefined;
				let downloadedBytes = 0;
				await update.downloadAndInstall((event) => {
					if (event.event === "Started") {
						contentLength = event.data.contentLength;
					} else if (event.event === "Progress") {
						downloadedBytes += event.data.chunkLength;
						setStatus({
							downloading: true,
							downloadedBytes,
							totalBytes: contentLength,
							downloadProgress:
								contentLength && contentLength > 0
									? Math.min(
											100,
											Math.round((downloadedBytes / contentLength) * 100),
										)
									: undefined,
						});
					}
				});
				// Windows exits during install and relaunches itself; on
				// macOS/Linux the user restarts via the Settings row.
				setStatus({ downloading: false, readyToInstall: true });
			} catch (error) {
				setStatus({ downloading: false, error: errorMessage(error) });
			}
		},
		restartAndInstall: async () => {
			try {
				await relaunch();
			} catch (error) {
				setStatus({ error: errorMessage(error) });
			}
		},
	},
	metadata: {
		getVersion,
		isTauri: true,
	},
};
