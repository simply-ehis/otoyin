import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useBootReadiness } from "@/lib/hooks/useBootReadiness";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";

/**
 * Quiet backend-status banner: surfaces the shared boot state without
 * toasts or console spam. When the backend is restarting mid-download the
 * Store and Library polls back off silently — this single banner is the
 * only visible signal, replacing the previous wall of console errors.
 *
 * Reads the ref-counted poller in useBootReadiness rather than running its
 * own; two pollers on /health/ready doubled the request rate for no gain.
 *
 * Safe mode (design doc §8): if Rust skipped the automatic backend start
 * after two consecutive crashes (persisted across launches), it emits
 * `backend-safe-mode` and this banner offers a manual "Start engine"
 * action instead of hiding — a dead locked backend is otherwise silent.
 */
export function BackendStatusBanner() {
	const baseUrl = useServerStore((s) => s.serverUrl);
	const status = useBootReadiness(baseUrl);
	const platform = usePlatform();
	const [safeMode, setSafeMode] = useState(false);
	const [startError, setStartError] = useState("");

	useEffect(() => {
		if (!platform.metadata.isTauri) {
			return;
		}
		let unlisten: (() => void) | undefined;
		void listen("backend-safe-mode", () => setSafeMode(true))
			.then((stop) => {
				unlisten = stop;
			})
			.catch(() => {});
		return () => unlisten?.();
	}, [platform.metadata.isTauri]);

	if (safeMode) {
		return (
			<output className="flex items-center justify-center gap-2 border-b border-destructive/40 bg-danger-soft px-3 py-2 text-xs text-danger-text">
				<span className="inline-block size-2 rounded-full bg-destructive" />
				Otoyin&rsquo;s engine failed to start twice - it wasn&rsquo;t started
				automatically.
				<button
					type="button"
					onClick={() => {
						setStartError("");
						void invoke("restart_server", {
							modelsDir: null,
							port: null,
						})
							.then(() => invoke("safe_mode_clear"))
							.then(() => setSafeMode(false))
							.catch(() =>
								setStartError(
									"The engine still couldn't start — check the logs for details.",
								),
							);
					}}
					className="rounded-md border border-danger-text/40 bg-transparent px-2 py-0.5 text-[11px] font-medium text-danger-text transition-colors hover:bg-danger-soft"
				>
					Start engine anyway
				</button>
				{startError && (
					<span role="alert" className="text-[11px]">
						{startError}
					</span>
				)}
			</output>
		);
	}

	if (status.ready !== false || status.status === "waiting") {
		return null;
	}

	return (
		<output className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-text">
			<span className="inline-block size-2 animate-pulse rounded-full bg-warning" />
			Backend is starting — downloads and playback will resume automatically.
		</output>
	);
}
