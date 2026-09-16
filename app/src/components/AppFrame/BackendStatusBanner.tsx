import { useQuery } from "@tanstack/react-query";
import { useServerStore } from "@/stores/serverStore";

/**
 * Quiet backend-status banner: polls /health/ready without toasts or
 * console spam. When the backend is restarting mid-download the Store and
 * Library polls back off silently — this single banner is the only visible
 * signal, replacing the previous wall of console errors.
 */
export function BackendStatusBanner() {
	const baseUrl = useServerStore((s) => s.serverUrl);
	const status = useQuery({
		queryKey: ["backend-ready"],
		queryFn: async () => {
			const res = await fetch(`${baseUrl}/health/ready`, {
				signal: AbortSignal.timeout(5000),
			});
			if (!res.ok) {
				throw new Error(`ready ${res.status}`);
			}
			return (await res.json()) as { ready: boolean; status: string };
		},
		refetchInterval: (q) => (q.state.data?.ready === false ? 3000 : 15000),
		retry: 1,
		staleTime: 5000,
		meta: { skipGlobalErrorToast: true },
	});

	if (status.isPending || status.data?.ready !== false) {
		return null;
	}

	return (
		<output className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning-text">
			<span className="inline-block size-2 animate-pulse rounded-full bg-warning" />
			Backend is starting — downloads and playback will resume automatically.
		</output>
	);
}
