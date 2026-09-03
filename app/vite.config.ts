import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-React";
import { defineConfig } from "vite";
import { changelogPlugin } from "./plugins/changelog";

export default defineConfig({
	plugins: [react(), tailwindcss(), changelogPlugin(path.resolve(__dirname, ".."))],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		host: "0.0.0.0",
		port: 21132,
		strictPort: false,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:17493",
				changeOrigin: true,
				rewrite: (path) => {
					// Rewrite /api/v1/catalog/* → /marketplace/*
					if (path.startsWith("/api/v1/catalog")) {
						return path.replace(/^\/api\/v1\/catalog/, "/marketplace")
					}
					return path.replace(/^\/api/, "")
				},
			},
		},
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "vendor-react";
					if (id.includes("@tanstack/react-query") || id.includes("@tanstack/react-router")) return "vendor-tanstack";
					if (id.includes("framer-motion") || id.includes("node_modules/motion")) return "vendor-ui";
					if (id.includes("@radix-ui")) return "vendor-radix";
					if (id.includes("@dnd-kit")) return "vendor-dnd";
					if (id.includes("zustand")) return "vendor-state";
					if (id.includes("react-hook-form") || id.includes("@hookform/resolvers") || id.includes("zod")) return "vendor-forms";
					if (id.includes("react-markdown") || id.includes("remark-")) return "vendor-markdown";
					if (id.includes("react-syntax-highlighter")) return "vendor-syntax";
					if (id.includes("wavesurfer")) return "vendor-wavesurfer";
					if (id.includes("src/components/Store")) return "page-store";
					if (id.includes("src/components/AudioStudio")) return "page-audio-studio";
					if (id.includes("src/components/Workspace")) return "page-workspace";
				},
			},
		},
	},
});
