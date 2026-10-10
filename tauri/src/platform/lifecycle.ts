import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	PlatformLifecycle,
	ServerError,
	ServerLogEntry,
} from "@/platform/types";

class TauriLifecycle implements PlatformLifecycle {
	onServerReady?: () => void;

	async startServer(
		remote = false,
		modelsDir?: string | null,
	): Promise<string> {
		try {
			const result = await invoke<string>("start_server", {
				remote,
				modelsDir: modelsDir ?? undefined,
			});
			console.log("Server started:", result);
			this.onServerReady?.();
			return result;
		} catch (error) {
			console.error("Failed to start server:", error);
			throw error;
		}
	}

	async stopServer(): Promise<void> {
		try {
			await invoke("stop_server");
			console.log("Server stopped");
		} catch (error) {
			console.error("Failed to stop server:", error);
			throw error;
		}
	}

	async restartServer(modelsDir?: string | null): Promise<string> {
		try {
			const result = await invoke<string>("restart_server", {
				modelsDir: modelsDir ?? undefined,
			});
			console.log("Server restarted:", result);
			this.onServerReady?.();
			return result;
		} catch (error) {
			console.error("Failed to restart server:", error);
			throw error;
		}
	}

	async setupWindowCloseHandler(): Promise<void> {
		// Closing the app now always stops the backend, and Rust owns that
		// decision unconditionally (`on_window_event` -> `stop_if_ours`). This
		// handler used to ask permission via a `window-close-requested` round-trip
		// and then gate the kill on `window.__TWENTYLABSServerStartedByApp` —
		// a global that is declared in global.d.ts but never assigned anywhere, so
		// it was always false and the backend was never stopped on close. Two
		// handlers (this one and the JS `onCloseRequested` in tauriPlatform.ts)
		// also raced on the same event, each calling preventDefault, with the kill
		// wrapped in a fire-and-forget `catch {}`.
		//
		// Nothing is needed here now; the method is kept so the PlatformLifecycle
		// contract is unchanged.
		return;
	}

	subscribeToServerLogs(callback: (entry: ServerLogEntry) => void): () => void {
		let disposed = false;
		let unlisten: (() => void) | null = null;

		void listen<ServerLogEntry>("server-log", (event) => {
			callback(event.payload);
		})
			.then((fn) => {
				if (disposed) {
					fn();
					return;
				}
				unlisten = fn;
			})
			.catch((error) => {
				console.error("Failed to subscribe to server logs:", error);
			});

		return () => {
			disposed = true;
			unlisten?.();
			unlisten = null;
		};
	}

	subscribeToServerErrors(callback: (error: ServerError) => void): () => void {
		let disposed = false;
		let unlisten: (() => void) | null = null;

		void listen<ServerError>("server-error", (event) => {
			callback(event.payload);
		})
			.then((fn) => {
				if (disposed) {
					fn();
					return;
				}
				unlisten = fn;
			})
			.catch((error) => {
				console.error("Failed to subscribe to server errors:", error);
			});

		return () => {
			disposed = true;
			unlisten?.();
			unlisten = null;
		};
	}
}

export const tauriLifecycle = new TauriLifecycle();
