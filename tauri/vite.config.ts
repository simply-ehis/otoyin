import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { changelogPlugin } from "../app/plugins/changelog";

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		changelogPlugin(path.resolve(__dirname, "..")),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "../app/src"),
		},
		dedupe: [
			"@tanstack/react-query",
			"@tanstack/query-core",
			"react",
			"react-dom",
			"i18next",
			"react-i18next",
		],
	},
	root: path.resolve(__dirname),
	clearScreen: false,
	server: {
		port: 21132,
		strictPort: true,
		watch: {
			ignored: ["!**/../app/**"],
		},
	},
	envPrefix: ["VITE_", "TAURI_"],
	build: {
		target: "es2021",
		minify: !process.env.TAURI_DEBUG,
		sourcemap: !!process.env.TAURI_DEBUG,
		outDir: "dist",
		rollupOptions: {
			output: {
				// Same code-splitting map as app/vite.config.ts so both shells ship
				// identical chunking. Page-chunk rules match app/src paths via the
				// '@' alias. Module ids are absolute; `src/components/...` matches
				// the app tree in both workspaces.
				//
				// GOTCHA (rolldown 1.2.7 / vite 8): a module shared between manual
				// chunks is placed in the ALPHABETICALLY FIRST chunk that imports it
				// (its own returned name is overridden). React therefore must live in
				// "vendor-core" — "core" sorts before every other vendor-* chunk that
				// imports react (dnd, forms, markdown, radix, state, tanstack, ui,
				// syntax, wavesurfer). Naming it "vendor-react" made rolldown swallow
				// react into "vendor-dnd" and entry/index.html preloaded the whole
				// dnd chunk at boot. Renaming to anything >= "vendor-dnd" re-breaks.
				manualChunks(id) {
					if (
						id.includes("node_modules/react-dom") ||
						id.includes("node_modules/react/")
					) {
						return "vendor-core";
					}
					if (
						id.includes("@tanstack/react-query") ||
						id.includes("@tanstack/react-router") ||
						id.includes("@tanstack/query-core")
					) {
						return "vendor-tanstack";
					}
					if (
						id.includes("framer-motion") ||
						id.includes("node_modules/motion")
					) {
						return "vendor-ui";
					}
					if (id.includes("@radix-ui")) {
						return "vendor-radix";
					}
					if (id.includes("@dnd-kit")) {
						return "vendor-dnd";
					}
					if (id.includes("zustand")) {
						return "vendor-state";
					}
					if (
						id.includes("react-hook-form") ||
						id.includes("@hookform/resolvers") ||
						id.includes("zod")
					) {
						return "vendor-forms";
					}
					if (id.includes("react-markdown") || id.includes("remark-")) {
						return "vendor-markdown";
					}
					if (id.includes("react-syntax-highlighter")) {
						return "vendor-syntax";
					}
					if (id.includes("wavesurfer")) {
						return "vendor-wavesurfer";
					}

					// NOTE: no manualChunks for app code -- must stay identical to
					// app/vite.config.ts so both shells ship identical chunking.
					//
					// Naming a route directory here (e.g. "src/components/Workspace" ->
					// "page-workspace") hoists the ENTIRE directory into one eagerly
					// preloaded chunk. That defeats lazy(): every route inside it becomes
					// a startup dependency, so the 388 KB workspace chunk landed in
					// index.html's modulepreloads and every chunk in the app ended up
					// importing it. Rollup's automatic splitting already splits per
					// dynamic import() boundary, which is what router.tsx's 70 lazy()
					// routes rely on. Vendor splitting above stays: those ARE genuinely
					// shared across routes.
					return undefined;
				},
			},
		},
	},
});
