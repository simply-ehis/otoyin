import { useEffect, useState } from "react";

function getIsMacOS(): boolean {
	if (typeof navigator === "undefined") {
		return false;
	}
	// Modern API
	if ("userAgentData" in navigator) {
		const uaData = (navigator as { userAgentData?: { platform?: string } })
			.userAgentData;
		return uaData?.platform?.toLowerCase().includes("mac") ?? false;
	}
	// Fallback for older browsers
	return navigator.platform?.toLowerCase().includes("mac") ?? false;
}

/** True on macOS (traffic-light safe-area handling). Updates live. */
export function useIsMacOS(): boolean {
	const [isMac, setIsMac] = useState(getIsMacOS);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		// Re-check on any media change (covers platform changes in Tauri)
		const handler = () => setIsMac(getIsMacOS());
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);
	return isMac;
}
