import { expect, test } from "@playwright/test";

/**
 * Live tour against the REAL backend (boot it on :17493 first):
 * visits most tabs, operates the studio (add/duplicate/plugin menu/stitch
 * dialog), screenshots everything into the shared tour dir, and fails on
 * any uncaught page exception.
 */
test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } });
test.setTimeout(300_000);

const SHOT = "C:/Users/ehis/AppData/Local/Temp/opencode/tour";

const TABS: Array<[string, string]> = [
	["/", "01-home"],
	["/generation", "02-generation"],
	["/voices", "03-voices"],
	["/stories", "04-stories"],
	["/captures", "05-captures"],
	["/effects", "06-effects"],
	["/models", "07-models"],
	["/store", "08-store"],
	["/mixer", "09-mixer"],
	["/workspace", "10-workspace"],
	["/adr", "11-adr"],
	["/gpu", "12-gpu"],
	["/logs", "13-logs"],
	["/mcp", "14-mcp"],
	["/settings", "15-settings"],
	["/help", "16-help"],
	["/about", "17-about"],
];

test("tour every tab with screenshots", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	for (const [path, shot] of TABS) {
		await page.goto(path, { waitUntil: "domcontentloaded" });
		await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15000 });
		await page.waitForTimeout(1200);
		await page.screenshot({ path: `${SHOT}/${shot}.png` });
	}
	expect(errors, "page errors during tour").toEqual([]);
});

test("operate the studio live", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	await page.goto("/audio-studio", { waitUntil: "domcontentloaded" });
	// Dismiss the first-run welcome tour via its close button.
	const dialog = page.getByRole("dialog", { name: "Welcome tour" });
	await dialog.waitFor({ timeout: 20000 });
	await dialog.getByRole("button").first().click();
	await expect(dialog).toBeHidden({ timeout: 10000 });
	await expect(page.getByText("Track 1").first()).toBeVisible({
		timeout: 20000,
	});
	await page.screenshot({ path: `${SHOT}/20-studio-empty.png` });

	// Add + duplicate tracks.
	await page.getByRole("button", { name: "Add track" }).click();
	await page.getByRole("button", { name: "Duplicate Track 1" }).click();
	await expect(page.getByText("Track 1 copy").first()).toBeVisible();
	await page.screenshot({ path: `${SHOT}/21-studio-tracks.png` });

	// Plugin catalog (live backend: full registry expected).
	await page.getByRole("button", { name: "Plugins" }).first().click();
	await page.getByRole("button", { name: "Add Plugin" }).click();
	await expect(page.getByText("Live preview")).toBeVisible();
	await page.screenshot({ path: `${SHOT}/22-studio-plugins.png` });
	// Add a chorus from the catalog.
	await page.getByRole("button", { name: "Chorus / Flanger" }).click();
	await page.screenshot({ path: `${SHOT}/23-studio-chorus-added.png` });

	// Tools menu: stitch dialog walk-through (cancel, no audio needed).
	await page.getByRole("button", { name: "Tools", exact: true }).click();
	await page.screenshot({ path: `${SHOT}/24-studio-tools.png` });
	await page.getByRole("button", { name: "Stitch Tracks…" }).click();
	await expect(
		page.getByRole("dialog", { name: "Stitch tracks" }),
	).toBeVisible();
	await page.screenshot({ path: `${SHOT}/25-studio-stitch-dialog.png` });
	await page.keyboard.press("Escape");

	// Crossfade trimmer on the second track.
	await page.getByRole("button", { name: "Crossfade" }).first().click();
	await page.getByRole("combobox", { name: "Crossfade target" }).click();
	await page.getByRole("option", { name: "Track 2" }).click();
	await expect(page.getByText("Fade length")).toBeVisible();
	await page.screenshot({ path: `${SHOT}/26-studio-crossfade.png` });

	expect(errors, "page errors operating studio").toEqual([]);
});
