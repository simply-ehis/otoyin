import { defineConfig, devices } from "@playwright/test";

/**
 * Browser e2e: critical user paths, not unit-test reruns.
 * - smoke: every route boots without a page-level exception.
 * - store/settings: key screens render against mocked API responses.
 * Backend-independent by design (page.route mocks); API-level flows live
 * in backend/tests/test_e2e_flows.py instead. No backend required.
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? "line" : "list",
	use: {
		baseURL: "http://127.0.0.1:21132",
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "npm run dev -- --port 21132 --strictPort",
		cwd: import.meta.dirname,
		url: "http://127.0.0.1:21132",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
