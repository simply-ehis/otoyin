import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { queryClient } from "./lib/queryClient";
import { PlatformProvider } from "./platform/PlatformContext";
import { webPlatform } from "./platform/webPlatform";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element #root not found");
}
ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<PlatformProvider platform={webPlatform}>
				<App />
			</PlatformProvider>
		</QueryClientProvider>
	</React.StrictMode>,
);
