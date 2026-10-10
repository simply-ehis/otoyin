import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { changelogPlugin } from "./plugins/changelog";

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		changelogPlugin(path.resolve(__dirname, "..")),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
		globals: true,
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		// 59 jsdom files on a loaded machine: environment setup alone can
		// exceed 800s cumulative, and first-tests pay cold-module cost —
		// the 5s default flakes under load. 10s still catches real hangs.
		testTimeout: 10000,
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.d.ts",
				"src/**/*.test.{ts,tsx}",
				"src/**/*.spec.{ts,tsx}",
			],
		},
	},
});
