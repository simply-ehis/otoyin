import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";

export type BackendRestartPhase = "idle" | "stopping" | "waiting" | "ready";

const POLL_MS = 1000;
const TIMEOUT_MS = 120000;

/**
 * Restart the backend through the platform lifecycle and poll until it is
 * healthy again. On Tauri this invokes the real `restart_server` sidecar
 * command (optionally on a new `port`, which becomes the new server URL);
 * on web it resolves immediately since the dev backend is user-managed.
 *
 * Shared by the GPU backend switch and the serving-port setting so the
 * stop → wait → ready sequence (and its failure modes) live in one place.
 */
export function useBackendRestart() {
	const platform = usePlatform();
	const queryClient = useQueryClient();
	const [phase, setPhase] = useState<BackendRestartPhase>("idle");
	const [error, setError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	useEffect(() => () => stopPolling(), [stopPolling]);

	const restart = useCallback(
		async (port?: number | null) => {
			setError(null);
			setPhase("stopping");
			try {
				const url = await platform.lifecycle.restartServer(null, port ?? null);
				// The command returns the URL the backend is (re)starting on
				// ("" in web/dev where the backend is user-managed).
				if (url && url !== "remote") {
					useServerStore.getState().setServerUrl(url);
				}
			} catch (e: unknown) {
				stopPolling();
				setPhase("idle");
				setError(e instanceof Error ? e.message : "Backend restart failed");
				throw e;
			}
			setPhase("waiting");
			const deadline = Date.now() + TIMEOUT_MS;
			await new Promise<void>((resolve, reject) => {
				stopPolling();
				pollRef.current = setInterval(() => {
					void (async () => {
						try {
							const result = await apiClient.getHealth();
							if (result.status === "healthy") {
								stopPolling();
								setPhase("ready");
								void queryClient.invalidateQueries();
								window.setTimeout(() => setPhase("idle"), 2000);
								resolve();
							} else if (Date.now() > deadline) {
								throw new Error("Backend did not come back in time");
							}
							// Still down — keep polling.
						} catch (e: unknown) {
							if (Date.now() > deadline) {
								stopPolling();
								setPhase("idle");
								const msg =
									e instanceof Error
										? e.message
										: "Backend did not come back in time";
								setError(msg);
								reject(new Error(msg));
							}
							// Still down — keep polling.
						}
					})();
				}, POLL_MS);
			});
		},
		[platform, queryClient, stopPolling],
	);

	return { phase, error, setError, restart };
}
