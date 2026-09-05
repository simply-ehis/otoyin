import { expect, test } from "@playwright/test";

/**
 * Every route boots: no uncaught page exception, app root mounts content.
 * Backend is absent, so data views show loading/error/empty states — that
 * is fine and also covered. A white screen or a thrown render error fails.
 */
const ROUTES = [
	"/",
	"/stories",
	"/audiobooks",
	"/voices",
	"/captures",
	"/effects",
	"/models",
	"/store",
	"/settings",
	"/generation",
	"/mcp",
	"/gpu",
	"/logs",
	"/about",
	"/shortcuts",
	"/timecode",
	"/scripting",
	"/plugins",
	"/lottie-export",
	"/telemetry",
	"/api-keys",
	"/system",
	"/dubbing",
	"/workspace",
	"/timeline",
	"/pitch",
	"/mixer",
	"/studio",
	"/instruments",
	"/dsp",
	"/adr",
];

for (const path of ROUTES) {
	test(`boots: ${path}`, async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (err) => errors.push(String(err)));
		await page.goto(path, { waitUntil: "domcontentloaded" });
		// App shell mounts (sidebar chrome) even when data is missing.
		await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15000 });
		expect(errors, `page errors on ${path}`).toEqual([]);
	});
}
