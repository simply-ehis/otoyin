import {
	ExclamationTriangleIcon,
	InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useServerHealth } from "@/lib/hooks/useServer";
import { cn } from "@/lib/utils/cn";
import { useServerStore } from "@/stores/serverStore";

/**
 * Shows a persistent banner when the backend is unreachable or has
 * a startup failure. Sits above main content alongside other banners.
 *
 * States:
 * - Connected + healthy → hidden
 * - Initializing (503) → info banner with retry
 * - Network error (signal lost) → error banner with hint
 * - Startup failed → error banner with the failure reason
 */
export function ServerStatusBanner() {
	const isConnected = useServerStore((s) => s.isConnected);
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { data: health, error: healthError, isLoading } = useServerHealth();

	// Don't show during initial load (first few seconds of polling)
	if (isLoading && !healthError) {
		return null;
	}

	// Healthy — hide banner
	if (isConnected && health?.status === "healthy") {
		return null;
	}

	// Determine the message and style
	const msg = healthError instanceof Error ? healthError.message : "";
	const isStartupFailed =
		typeof health === "object" &&
		health !== null &&
		"status" in health &&
		(health as { status?: string }).status === "startup_failed";

	if (isStartupFailed) {
		const error = (health as { error?: string }).error ?? "Unknown error";
		return (
			<StatusBanner
				variant="error"
				icon={ExclamationTriangleIcon}
				message={`Startup failed: ${error}`}
			/>
		);
	}

	if (isConnected === false || (healthError && !isConnected)) {
		return (
			<StatusBanner
				variant="error"
				icon={ExclamationTriangleIcon}
				message={`Cannot reach backend at ${serverUrl} — check that the server is running`}
			/>
		);
	}

	if (msg.toLowerCase().includes("initializing")) {
		return (
			<StatusBanner
				variant="info"
				icon={InformationCircleIcon}
				message="Server is initializing — models loading in background"
			/>
		);
	}

	return null;
}

function StatusBanner({
	variant,
	icon: Icon,
	message,
}: {
	variant: "info" | "error";
	icon: typeof InformationCircleIcon;
	message: string;
}) {
	const styles = {
		// Solid status surfaces — no translucent fills.
		info: "bg-secondary border-border text-foreground",
		error: "bg-danger-soft border-destructive/40 text-danger-text",
	};
	return (
		<div className="mx-auto mt-3 max-w-[1800px] px-8">
			<div
				className={cn(
					"flex items-center gap-3 rounded-lg border px-4 py-3",
					styles[variant],
				)}
			>
				<Icon className="size-5 shrink-0" aria-hidden="true" />
				<span className="text-sm">{message}</span>
			</div>
		</div>
	);
}
