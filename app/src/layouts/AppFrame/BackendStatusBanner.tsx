import { useBootReadiness } from "@/lib/hooks/useBootReadiness";
import { useServerStore } from "@/stores/serverStore";

/**
 * Quiet backend-status banner: surfaces the shared boot state without
 * toasts or console spam. When the backend is restarting mid-download the
 * Store and Library polls back off silently — this single banner is the
 * only visible signal, replacing the previous wall of console errors.
 *
 * Reads the ref-counted poller in useBootReadiness rather than running its
 * own; two pollers on /health/ready doubled the request rate for no gain.
 */
export function BackendStatusBanner() {
	const baseUrl = useServerStore((s) => s.serverUrl);
	const status = useBootReadiness(baseUrl);

	if (status.ready !== false || status.status === "waiting") {
		return null;
	}

	return (
		<output className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning-text">
			<span className="inline-block size-2 animate-pulse rounded-full bg-warning" />
			Backend is starting — downloads and playback will resume automatically.
		</output>
	);
}
