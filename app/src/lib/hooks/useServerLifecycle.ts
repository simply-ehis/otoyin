import { useEffect } from "react";
import { usePlatform } from "@/platform/PlatformContext";

/**
 * Wires the backend lifecycle once at app boot: in Tauri, intercepts
 * window-close so the bundled backend is stopped first (unless the user
 * enabled keep-running). Web is a no-op. Mount once at the top of the app
 * (AppFrame), next to {@link useServerErrorToast}.
 */
export function useServerLifecycle() {
	const platform = usePlatform();

	useEffect(() => {
		let cancelled = false;
		void platform.lifecycle.setupWindowCloseHandler().catch(() => {
			if (!cancelled) {
				// Web fallback and headless tests land here — closing
				// still works via the Rust-side 3s fallback / browser.
			}
		});
		return () => {
			cancelled = true;
		};
	}, [platform]);
}
