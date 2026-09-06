import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { isTauri } from "@tauri-apps/api/core";
import { queryClient } from "./lib/queryClient";
import { PlatformProvider } from "./platform/PlatformContext";
import { tauriPlatform } from "./platform/tauriPlatform";
import { webPlatform } from "./platform/webPlatform";

// Desktop build → real updater + Tauri metadata; browser build → noop
// updater so the update UI stays hidden (isTauri: false gates it).
const platform = isTauri() ? tauriPlatform : webPlatform;

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element #root not found");
}
ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<PlatformProvider platform={platform}>
				<App />
			</PlatformProvider>
		</QueryClientProvider>
	</React.StrictMode>,
);
