import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/i18n";
// Import CSS from app directory using alias so Tailwind can scan the source files
import "@/index.css";
import { PlatformProvider } from "@/platform/PlatformContext";
import { webPlatform } from "@/platform/webPlatform";
import { tauriPlatform } from "./platform";

/**
 * Pick the platform at runtime.
 *
 * This entry is used both by the packaged Tauri app and by `vite dev` in a
 * plain browser. Hardcoding `tauriPlatform` meant every browser session threw
 * `Cannot read properties of undefined (reading 'transformCallback')` from the
 * Tauri IPC bridge and logged a close-handler failure on every mount, because
 * `window.__TAURI_INTERNALS__` only exists inside the webview.
 */
const isTauriRuntime =
	typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const platform = isTauriRuntime ? tauriPlatform : webPlatform;

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			gcTime: 1000 * 60 * 10, // 10 minutes
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<PlatformProvider platform={platform}>
				<App />
			</PlatformProvider>
		</QueryClientProvider>
	</React.StrictMode>,
);
