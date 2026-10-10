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
				// GOTCHA (rolldown 1.2.7 / vite 8): a module shared between manual
				// chunks is placed in the ALPHABETICALLY FIRST chunk that imports
				// it — its own returned name below is overridden. The react chunk
				// was named "vendor-react", which sorts AFTER "vendor-dnd"/
				// "vendor-forms", so react got swallowed into vendor-dnd and
				// entry/index.html preloaded all 153 KB of dnd at boot. That is
				// why react lives in "vendor-core": every OTHER vendor-* chunk
				// here imports react, and "core" sorts before all of them
				// (c < d,f,m,r,s,t,u,w). Renaming this chunk to anything that
				// sorts >= "vendor-dnd" re-breaks entry preloading.
				manualChunks(id: string) {
					let name: string | undefined;
					if (
						id.includes("node_modules/react-dom") ||
						id.includes("node_modules/react/")
					) {
						name = "vendor-core";
					} else if (
						id.includes("@tanstack/react-query") ||
						id.includes("@tanstack/react-router") ||
						id.includes("@tanstack/query-core")
					) {
						name = "vendor-tanstack";
					} else if (
						id.includes("framer-motion") ||
						id.includes("node_modules/motion")
					) {
						name = "vendor-ui";
					} else if (id.includes("@radix-ui")) {
						name = "vendor-radix";
					} else if (id.includes("@dnd-kit")) {
						name = "vendor-dnd";
					} else if (id.includes("zustand")) {
						name = "vendor-state";
					} else if (
						id.includes("react-hook-form") ||
						id.includes("@hookform/resolvers") ||
						id.includes("zod")
					) {
						name = "vendor-forms";
					} else if (id.includes("react-markdown") || id.includes("remark-")) {
						name = "vendor-markdown";
					} else if (id.includes("react-syntax-highlighter")) {
						name = "vendor-syntax";
					} else if (id.includes("wavesurfer")) {
						name = "vendor-wavesurfer";
					}

					// NOTE: no manualChunks for app code.
					//
					// Naming a route directory here (e.g. "src/components/Workspace"
					// -> "page-workspace") hoists the ENTIRE directory into one
					// eagerly-preloaded chunk. That defeats lazy(): every route inside
					// it becomes a startup dependency, so the 379 KB workspace chunk
					// shipped in index.html's modulepreloads. Rollup's automatic
					// splitting already splits per dynamic import() boundary, which is
					// what router.tsx's 70 lazy() routes rely on. Vendor splitting
					// above stays because those ARE genuinely shared across routes.
					return name;
				},
			},
		},
	},
});
