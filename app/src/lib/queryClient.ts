import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { showStudioErrorToast } from "@/lib/errors";

/**
 * Shared QueryClient instance used across the app.
 *
 * Extracted into its own side-effect-free module so it can be imported from
 * both the React bootstrap (main.tsx) and non-React code (stores, utilities)
 * without pulling in ReactDOM or other bootstrap side effects.
 *
 * QueryCache/MutationCache both get a global onError that routes through
 * showStudioErrorToast (lib/errors.ts) — the music-themed error classifier
 * that already existed in this codebase but had no callers anywhere. A
 * query/mutation that defines its own onError (or sets
 * meta.skipGlobalErrorToast) is left alone so this doesn't double up with
 * error handling a component already does itself.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
			// Retry transient backend-down states (network/503) with backoff,
			// but never retry client errors (400/404/402) — those are final.
			// This stops the "bunch of console errors" when the backend
			// restarts mid-poll: polls back off quietly instead of erroring.
			retry: (failureCount, error) => {
				if (failureCount >= 2) {
					return false;
				}
				const msg = error instanceof Error ? error.message : "";
				if (
					msg.includes("Signal lost") ||
					msg.includes("initializing") ||
					msg.includes("503") ||
					msg.includes("Failed to fetch")
				) {
					return true;
				}
				return false;
			},
			retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
			refetchOnWindowFocus: false,
		},
	},
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (query.meta?.skipGlobalErrorToast) {
				return;
			}
			// Backend-down / initializing polls are handled by the global
			// backend-status banner — toasting per query spams the UI and
			// the console every 30s while the server restarts.
			if (error instanceof Error) {
				const msg = error.message.toLowerCase();
				if (
					msg.includes("signal lost") ||
					msg.includes("initializing") ||
					msg.includes("failed to fetch") ||
					msg.includes("network")
				) {
					return;
				}
			}
			showStudioErrorToast(error);
		},
	}),
	mutationCache: new MutationCache({
		onError: (error, _vars, _ctx, mutation) => {
			if (mutation.options.onError || mutation.meta?.skipGlobalErrorToast) {
				return;
			}
			showStudioErrorToast(error);
		},
	}),
});

/**
 * Invalidate all cached queries when the server restarts.
 * Call this after detecting server recovery.
 */
export function invalidateAllQueriesOnServerRestart(): void {
	queryClient.invalidateQueries({ queryKey: ["profiles"] });
	queryClient.invalidateQueries({ queryKey: ["models"] });
	queryClient.invalidateQueries({ queryKey: ["history"] });
	queryClient.invalidateQueries({ queryKey: ["stories"] });
	queryClient.invalidateQueries({ queryKey: ["captures"] });
	queryClient.invalidateQueries({ queryKey: ["channels"] });
	queryClient.invalidateQueries({ queryKey: ["settings"] });
	queryClient.invalidateQueries({ queryKey: ["profile-channels"] });
	queryClient.invalidateQueries({ queryKey: ["assets"] });
	queryClient.invalidateQueries({ queryKey: ["conversations"] });
	queryClient.invalidateQueries({ queryKey: ["projects"] });
	queryClient.invalidateQueries({ queryKey: ["plans"] });
	queryClient.invalidateQueries({ queryKey: ["sources"] });
	queryClient.invalidateQueries({ queryKey: ["presets"] });
	queryClient.invalidateQueries({ queryKey: ["telemetry"] });
	queryClient.invalidateQueries({ queryKey: ["mcp"] });
}
