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
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type {
	Platform,
	ServerError,
	ServerLogEntry,
	UpdateStatus,
} from "./types";
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
	lifecycle: {
		startServer: async (remote, modelsDir, port) => {
			const url = await invoke<string>("start_server", {
				remote: remote ?? false,
				modelsDir: modelsDir ?? null,
				port: port ?? null,
			});
			return url;
		},
		stopServer: async () => {
			await invoke("stop_server");
		},
		restartServer: async (modelsDir, port) => {
			const url = await invoke<string>("restart_server", {
				modelsDir: modelsDir ?? null,
				port: port ?? null,
			});
			return url;
		},
		setupWindowCloseHandler: async () => {
			// Intentionally empty.
			//
			// This registered a second close handler (`win.onCloseRequested`)
			// alongside the Rust `on_window_event` handler. Both called
			// preventDefault on the same event, and the kill was a
			// fire-and-forget `invoke("stop_server")` in a `catch {}`. That
			// race is what let the window close while `otoyin-server.exe`
			// survived and kept holding the port. Rust now stops the backend
			// unconditionally before destroying the window, so a second
			// handler here would only reintroduce the race.
		},
		subscribeToServerLogs: (callback: (entry: ServerLogEntry) => void) => {
			let unlisten: (() => void) | undefined;
			void listen<ServerLogEntry>("server-log", (event) => {
				callback(event.payload);
			}).then((stop) => {
				unlisten = stop;
			});
			return () => unlisten?.();
		},
		subscribeToServerErrors: (callback: (error: ServerError) => void) => {
			let unlisten: (() => void) | undefined;
			void listen<ServerError>("server-error", (event) => {
				callback(event.payload);
			}).then((stop) => {
				unlisten = stop;
			});
			return () => unlisten?.();
		},
	},
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
				// The Windows updater runs the NSIS installer and then calls
				// process::exit directly — the Rust RunEvent::Exit cleanup
				// never fires, so stop the bundled backend here or its locked
				// exe image blocks the installer from replacing files
				// (failed/partial update + orphaned backend).
				try {
					await invoke("stop_server");
				} catch {
					// Backend not running or not ours — nothing to stop.
				}
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
