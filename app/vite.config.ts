import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { changelogPlugin } from "./plugins/changelog";

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		changelogPlugin(path.resolve(__dirname, "..")),
	],
	// Explicit root so the build output, alias, and plugin paths are
	// cwd-independent (matches tauri/vite.config.ts).
	root: path.resolve(__dirname),
	clearScreen: false,
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
		// Prevent duplicate React/TanStack/i18next instances if the workspace
		// ever resolves more than one copy (mirrors the tauri shell config).
		dedupe: [
			"@tanstack/react-query",
			"@tanstack/query-core",
			"react",
			"react-dom",
			"i18next",
			"react-i18next",
		],
	},
	server: {
		host: "0.0.0.0",
		port: 21132,
		// Browser variant may fall back to another port if 21132 is taken
		// (the Tauri shell requires strictPort because tauri.conf.json pins it).
		strictPort: false,
		proxy: {
			// NOTE: anchored so the /api-keys SETTINGS ROUTE is not
			// swallowed by the API proxy (prefix "/api" also matches it).
			"^/api/": {
				target: "http://127.0.0.1:17493",
				changeOrigin: true,
				rewrite: (path) => {
					// Rewrite /api/v1/catalog/* → /marketplace/*
					if (path.startsWith("/api/v1/catalog")) {
						return path.replace(/^\/api\/v1\/catalog/, "/marketplace");
					}
					return path.replace(/^\/api/, "");
				},
			},
		},
	},
	envPrefix: ["VITE_"],
	build: {
		target: "es2021",
		outDir: "dist",
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (
						id.includes("node_modules/react-dom") ||
						id.includes("node_modules/react/")
					)
						return "vendor-react";
					if (
						id.includes("@tanstack/react-query") ||
						id.includes("@tanstack/react-router") ||
						id.includes("@tanstack/query-core")
					)
						return "vendor-tanstack";
					if (
						id.includes("framer-motion") ||
						id.includes("node_modules/motion")
					)
						return "vendor-ui";
					if (id.includes("@radix-ui")) return "vendor-radix";
					if (id.includes("@dnd-kit")) return "vendor-dnd";
					if (id.includes("zustand")) return "vendor-state";
					if (
						id.includes("react-hook-form") ||
						id.includes("@hookform/resolvers") ||
						id.includes("zod")
					)
						return "vendor-forms";
					if (id.includes("react-markdown") || id.includes("remark-"))
						return "vendor-markdown";
					if (id.includes("react-syntax-highlighter")) return "vendor-syntax";
					if (id.includes("wavesurfer")) return "vendor-wavesurfer";
					if (id.includes("src/components/Store")) return "page-store";
					if (id.includes("src/components/AudioStudio"))
						return "page-audio-studio";
					if (id.includes("src/components/Workspace")) return "page-workspace";
				},
			},
		},
	},
});
