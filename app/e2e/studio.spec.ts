import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

/**
 * Audio Studio walk-through with the backend ABSENT (offline fallback path).
 * Proves the new studio UI is wired and regression-covers the empty-track
 * double-text overlap: exactly one empty-state message, never two.
 */
test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	await page.goto("/audio-studio", { waitUntil: "domcontentloaded" });
	await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15000 });
	// Dismiss the first-run welcome tour via its close button.
	const dialog = page.getByRole("dialog", { name: "Welcome tour" });
	await dialog.waitFor({ timeout: 20000 });
	await dialog.getByRole("button").first().click();
	await expect(dialog).toBeHidden({ timeout: 10000 });
	await expect.poll(() => errors.length, { timeout: 5000 }).toBe(0);
});

test("empty track shows exactly one empty-state message", async ({ page }) => {
	await expect(
		page.getByRole("button", { name: "Track 1" }).first(),
	).toBeVisible({ timeout: 15000 });
	await expect(page.getByText("Import audio or record")).toHaveCount(1);
	await expect(page.getByText("No audio", { exact: true })).toHaveCount(0);
});

test("add track, duplicate, and crossfade trimmer", async ({ page }) => {
	await expect(
		page.getByRole("button", { name: "Track 1" }).first(),
	).toBeVisible({ timeout: 15000 });

	// Second track via the transport add-track button.
	await page.getByRole("button", { name: "Add track" }).click();
	await expect(page.getByText("Track 2").first()).toBeVisible();

	// Duplicate clones with " copy" suffix.
	await page.getByRole("button", { name: "Duplicate Track 1" }).click();
	await expect(page.getByText("Track 1 copy").first()).toBeVisible();

	// Crossfade editor appears once another track exists.
	await page.getByRole("button", { name: "Crossfade" }).first().click();
	await page.getByRole("combobox", { name: "Crossfade target" }).click();
	await page.getByRole("option", { name: "Track 2" }).click();
	await expect(page.getByText("Fade length")).toBeVisible();
	await expect(page.getByText("100 ms")).toBeVisible();
});

test("tools menu offers stitch and render fx (disabled without audio)", async ({
	page,
}) => {
	await expect(page.getByText("Track 1").first()).toBeVisible({
		timeout: 15000,
	});
	await page.getByRole("button", { name: "Tools", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Stitch Tracks…" }),
	).toBeDisabled();
	await expect(page.getByRole("button", { name: "Render FX…" })).toBeDisabled();
});

test("add-plugin dropdown groups the fallback catalog", async ({ page }) => {
	await expect(page.getByText("Track 1").first()).toBeVisible({
		timeout: 15000,
	});
	await page.getByRole("button", { name: "Plugins" }).first().click();
	await page.getByRole("button", { name: "Add Plugin" }).click();
	await expect(page.getByText("Live preview")).toBeVisible();
	await expect(page.getByRole("button", { name: "EQ" })).toBeVisible();
	// Offline fallback has natives only — no backend-render section.
	await expect(page.getByText("Backend render")).toHaveCount(0);
});
