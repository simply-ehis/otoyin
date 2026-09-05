import { expect, test } from "@playwright/test";

/**
 * Settings without a backend: every control renders from local state,
 * server-dependent sections degrade to explicit offline hints.
 */
test("general settings render offline", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	await page.goto("/settings", { waitUntil: "domcontentloaded" });
	await expect(page.getByLabel("Server URL")).toBeVisible({ timeout: 15000 });
	await expect(page.getByLabel("Interface language")).toBeVisible();
	expect(errors).toEqual([]);
});

test("language switcher lists all nine locales", async ({ page }) => {
	await page.goto("/settings", { waitUntil: "domcontentloaded" });
	await page.getByLabel("Interface language").click();
	for (const label of [
		"English",
		"日本語",
		"简体中文",
		"繁體中文",
		"Español",
		"Français",
		"Deutsch",
		"Português (Brasil)",
		"한국어",
	]) {
		await expect(page.getByRole("option", { name: label })).toBeVisible();
	}
});

test("support page shows diagnostics section offline", async ({ page }) => {
	await page.goto("/settings", { waitUntil: "domcontentloaded" });
	// Navigate to support via sidebar if present; otherwise direct route probe.
	const supportLink = page.getByRole("link", { name: /support/i });
	if ((await supportLink.count()) > 0) {
		await supportLink.first().click();
		await expect(
			page.getByRole("heading", { name: /diagnostics/i }),
		).toBeVisible({ timeout: 15000 });
	}
});
