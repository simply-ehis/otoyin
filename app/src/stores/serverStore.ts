import { create } from "zustand";
import { persist } from "zustand/middleware";
import { queryClient } from "@/lib/queryClient";

interface ServerStore {
	serverUrl: string;
	setServerUrl: (url: string) => void;

	isConnected: boolean;
	setIsConnected: (connected: boolean) => void;

	mode: "local" | "remote";
	setMode: (mode: "local" | "remote") => void;

	/**
	 * Last explicitly-set non-loopback URL. Restored when switching back
	 * to remote mode so the toggle never strands the UI on loopback (F2).
	 */
	lastRemoteUrl: string | null;

	keepServerRunningOnClose: boolean;
	setKeepServerRunningOnClose: (keepRunning: boolean) => void;

	customModelsDir: string | null;
	setCustomModelsDir: (dir: string | null) => void;
}

/**
 * Invalidate all React Query caches so stale data from the previous
 * server is not shown. Called when the server URL changes.
 */
function invalidateAllServerData() {
	queryClient.invalidateQueries();
}

const LOCAL_DEFAULT_URL = "http://127.0.0.1:17493";

export function getDefaultServerUrl(): string {
	const envFallback = import.meta.env.VITE_SERVER_URL;
	const defaultFallback = LOCAL_DEFAULT_URL;

	if (!import.meta.env.PROD || typeof window === "undefined") {
		return envFallback || defaultFallback;
	}

	// F1: never derive the backend URL from the frontend origin — in a
	// split deploy (UI on one host, backend on another) that silently
	// points at the wrong host. Explicit opt-in only.
	if (import.meta.env.VITE_USE_ORIGIN_AS_API === "1") {
		const { protocol, origin, hostname } = window.location;
		if (
			(protocol === "http:" || protocol === "https:") &&
			origin &&
			hostname !== "tauri.localhost"
		) {
			return origin;
		}
	}

	return envFallback || defaultFallback;
}

export function isLoopbackServerUrl(url: string): boolean {
	// F4: hostname-only. A loopback host on a custom port (dev server,
	// custom backend port) is still local — the old :17493 requirement
	// misclassified those and clobbered intentional URLs.
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname === "127.0.0.1" ||
			parsed.hostname === "localhost" ||
			parsed.hostname === "[::1]" ||
			parsed.hostname === "::1"
		);
	} catch {
		return false;
	}
}

/** Legacy alias — prefer {@link isLoopbackServerUrl} in new code. */
export const isLoopbackTWENTYLABSServerUrl = isLoopbackServerUrl;

/**
 * F2/F3 helper for settings UI: remote mode pointing at loopback means
 * the toggle was flipped with no server address entered — prompt for it.
 */
export function isRemoteModeMisconfigured(
	mode: "local" | "remote",
	serverUrl: string,
): boolean {
	return mode === "remote" && isLoopbackServerUrl(serverUrl);
}

export const useServerStore = create<ServerStore>()(
	persist(
		(set, get) => ({
			serverUrl: getDefaultServerUrl(),
			setServerUrl: (url) => {
				const prev = get().serverUrl;
				// F3: mode follows the URL so the toggle can't lie — a
				// non-loopback address means remote, loopback means local.
				const patch: Partial<ServerStore> = { serverUrl: url };
				if (url !== prev) {
					if (isLoopbackServerUrl(url)) {
						patch.mode = "local";
					} else {
						patch.mode = "remote";
						patch.lastRemoteUrl = url;
					}
				}
				set(patch);
				if (url !== prev) {
					invalidateAllServerData();
				}
			},

			isConnected: false,
			setIsConnected: (connected) => set({ isConnected: connected }),

			mode: "local",
			lastRemoteUrl: null,
			setMode: (mode) => {
				const prevMode = get().mode;
				const prevUrl = get().serverUrl;
				set({ mode });
				if (mode === prevMode) {
					return;
				}
				if (mode === "local" && !isLoopbackServerUrl(prevUrl)) {
					set({ serverUrl: LOCAL_DEFAULT_URL });
				}
				if (mode === "remote") {
					// F2: restore the last known remote address instead of
					// stranding the UI on loopback with a "remote" label.
					const last = get().lastRemoteUrl;
					if (
						isLoopbackServerUrl(prevUrl) &&
						last &&
						!isLoopbackServerUrl(last)
					) {
						set({ serverUrl: last });
					}
				}
				invalidateAllServerData();
			},

			keepServerRunningOnClose: false,
			setKeepServerRunningOnClose: (keepRunning) =>
				set({ keepServerRunningOnClose: keepRunning }),

			customModelsDir: null,
			setCustomModelsDir: (dir) => set({ customModelsDir: dir }),
		}),
		{
			name: "otoyin-server",
		},
	),
);
