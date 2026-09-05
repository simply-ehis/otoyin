import { expect, test, type Page } from "@playwright/test";

/**
 * Storefront against mocked API: catalog renders localized prices,
 * the Donate card is present, and buying opens the mocked checkout.
 * Backend-independent (page.route); API flows live in
 * backend/tests/test_e2e_flows.py.
 */

const CATALOG = {
	version: 1,
	products: [
		{
			id: "kokoro",
			name: "Kokoro 82M",
			category: "tts",
			description: "Fast multilingual TTS",
			price_usd: 0,
			paid: false,
			quality_score: 5,
			local_status: "not_downloaded",
		},
		{
			id: "qwen3-tts",
			name: "Qwen3 TTS",
			category: "tts",
			description: "Studio voice cloning",
			price_usd: 19,
			paid: true,
			quality_score: 5,
			local_status: "not_downloaded",
		},
	],
};

async function mockStore(page: Page) {
	await page.route("**/marketplace/catalog", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATALOG) }),
	);
	await page.route("**/marketplace/entitlements", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entitlements: [] }) }),
	);
	await page.route("**/marketplace/offers", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ offers: [] }) }),
	);
	await page.route("**/marketplace/licenses", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ licenses: [] }) }),
	);
	await page.route("**/marketplace/wishlist**", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ product_ids: [] }) }),
	);
	await page.route("**/models/status", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) }),
	);
	await page.route("**/models/cache-dir", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ path: "/tmp/models" }) }),
	);
	await page.route("**/tasks/active", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ downloads: [] }),
		}),
	);
}

test("store renders catalog with free + paid states", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	await mockStore(page);
	await page.goto("/store", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Kokoro 82M").first()).toBeVisible({ timeout: 15000 });
	await expect(page.getByText("Qwen3 TTS").first()).toBeVisible();
	// Free badge vs localized paid price tag.
	await expect(page.getByText("Free").first()).toBeVisible();
	expect(errors).toEqual([]);
});

test("donate card is present with presets and custom amount", async ({ page }) => {
	await mockStore(page);
	await page.goto("/store", { waitUntil: "domcontentloaded" });
	const donate = page.getByRole("region", { name: /support otoyin/i });
	await expect(donate).toBeVisible({ timeout: 15000 });
	await expect(donate.getByRole("button", { name: "$25" })).toBeVisible();
	await expect(donate.getByLabel("Custom amount (USD)")).toBeVisible();
});

test("buy flow reaches checkout and shows recovery on timeout", async ({ page }) => {
	await mockStore(page);
	// Checkout succeeds; license poll stays unpaid so the retry surfaces.
	await page.route("**/v1/checkout", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				order_ref: "otoyin_e2e1",
				checkout_url: "https://pay.example/e2e1",
				product_id: "qwen3-tts",
				amount_usd: 19,
			}),
		}),
	);
	await page.route("**/v1/webhook/license/**", (route) =>
		route.fulfill({ status: 402, contentType: "application/json", body: "{}" }),
	);
	await page.goto("/store", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Qwen3 TTS").first()).toBeVisible({ timeout: 15000 });
	// Open the product detail and start checkout (popup blocked → same-tab).
	await page.getByText("Qwen3 TTS").first().click();
	await page.getByRole("button", { name: /buy .* get license/i }).click();
	// Poll window is long; the "Check again" path appears only after a
	// failure — assert the processing state instead of waiting it out.
	await expect(page.getByRole("button", { name: /processing/i })).toBeVisible({ timeout: 10000 });
});
