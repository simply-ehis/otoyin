import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useServerStore } from "@/stores/serverStore";

/**
 * Polls server health with proper failure handling:
 * - 503 (initializing) → auto-retries with backoff, does NOT mark as disconnected
 * - network failure → marks SIGNAL_LOST after retries exhausted
 * - logs every transition for diagnostics (see troubleshooting skill Flow 8)
 */
export function useServerHealth() {
	const serverUrl = useServerStore((state) => state.serverUrl);
	const setIsConnected = useServerStore((s) => s.setIsConnected);

	return useQuery({
		queryKey: ["server", "health", serverUrl],
		queryFn: async () => {
			try {
				const health = await apiClient.getHealth();
				setIsConnected(true);
				return health;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				// 503 initializing is transient — don't flip to disconnected yet
				if (msg.toLowerCase().includes("initializing")) {
					console.warn("[health] server initializing, will retry:", msg);
					throw err;
				}
				if (
					msg.toLowerCase().includes("signal lost") ||
					msg.toLowerCase().includes("fetch")
				) {
					console.warn("[health] SIGNAL_LOST:", msg);
					setIsConnected(false);
				}
				throw err;
			}
		},
		refetchInterval: 30000, // Check every 30 seconds
		retry: (failureCount, error) => {
			const msg = error instanceof Error ? error.message : String(error);
			// Retry 503 initializing more aggressively (server boots in ~3s now)
			if (msg.toLowerCase().includes("initializing")) {
				return failureCount < 6;
			}
			// Retry transient network blips once; don't hammer on hard 500
			if (msg.toLowerCase().includes("signal lost")) {
				return failureCount < 2;
			}
			return failureCount < 1;
		},
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
		// Keep stale data visible while revalidating so UI doesn't flash
		placeholderData: (prev) => prev,
	});
}

/** Lightweight readiness probe — used during initial bootstrap before full /health. */
export function useServerReady(enabled = true) {
	const serverUrl = useServerStore((state) => state.serverUrl);
	return useQuery({
		queryKey: ["server", "ready", serverUrl],
		queryFn: async () => {
			const base = serverUrl.replace(/\/$/, "");
			const res = await fetch(`${base}/health/ready`);
			if (!res.ok) {
				throw new Error(`health/ready ${res.status}`);
			}
			return (await res.json()) as {
				ready: boolean;
				status: string;
				error?: string;
			};
		},
		enabled,
		refetchInterval: (query) => {
			const data = query.state.data as
				| { ready?: boolean; status?: string }
				| undefined;
			// Stop polling once ready, or if startup failed (no point retrying)
			if (data?.ready || data?.status === "startup_failed") {
				return false;
			}
			return 1500; // poll every 1.5s until ready
		},
		retry: 6,
		retryDelay: 800,
	});
}
