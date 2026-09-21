/**
 * Marketplace client — talks directly to the remote marketplace server.
 *
 * Fetches catalog from marketplace.21labs.app, handles checkout, and
 * auto-installs licenses after payment. Falls back to bundled catalog
 * when offline.
 */
import { apiClient } from "./api/client";
import { debug } from "./utils/debug";

// In development, use Vite proxy to local marketplace backend
// In production, use the actual marketplace URL
const isDev = import.meta.env.DEV;
const MARKETPLACE_URL = isDev ? "/api" : "https://marketplace.21labs.app";
const LICENSE_POLL_INTERVAL_MS = 5_000;
const LICENSE_POLL_MAX_ATTEMPTS = 60; // 5 min total — covers 3-D Secure/bank redirects

// ── Types ──────────────────────────────────────────────────────────

export interface MarketplaceProduct {
	id: string;
	name: string;
	category: string;
	description: string;
	long_description?: string;
	price_usd: number;
	paid: boolean;
	avg_rating?: number;
	review_count?: number;
	size_mb?: number;
	languages?: string[];
	license?: string;
	note: string;
	special_offer: boolean;
	offer_discount_pct: number;
}

export interface CatalogResponse {
	schema_version: number;
	signed_at: string;
	currency: string;
	products: MarketplaceProduct[];
	sig: string;
}

export interface CheckoutResponse {
	order_ref: string;
	checkout_url: string;
	product_id: string;
	amount_usd: number;
	// Legacy Stripe-era fields (automatic_tax quotes). Paddle computes tax
	// on its own checkout page, so the backend omits these — kept optional
	// so old callers still compile.
	tax_amount?: number;
	total_usd?: number;
	tax_included?: boolean;
}

export interface RegionResponse {
	country_code: string;
	currency: string;
	country_name: string;
}

export interface ConvertedPrice {
	amount: number;
	currency: string;
	rate: number;
	formatted: string;
}

export interface TaxPreview {
	subtotal: number;
	tax_amount: number;
	tax_rate: number;
	tax_name: string;
	country_code: string;
	total: number;
	estimated: boolean;
	tax_country?: string;
}

// ── Client ─────────────────────────────────────────────────────────

class MarketplaceClient {
	private baseUrl: string;

	constructor(baseUrl: string = MARKETPLACE_URL) {
		this.baseUrl = baseUrl;
	}

	// ── Catalog ────────────────────────────────────────────────────

	/** Fetch catalog from remote server. Throws if offline. */
	async fetchCatalog(): Promise<CatalogResponse> {
		const resp = await fetch(`${this.baseUrl}/v1/catalog`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!resp.ok) {
			throw new Error(`Catalog fetch failed: ${resp.status}`);
		}
		let data: CatalogResponse;
		try {
			data = await resp.json();
		} catch (e) {
			throw new Error(`Catalog response was not valid JSON: ${e}`);
		}
		if (!data || !Array.isArray(data.products)) {
			throw new Error("Catalog response missing products array");
		}
		return data;
	}

	/** Get product by ID from remote catalog. */
	async getProduct(productId: string): Promise<MarketplaceProduct> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/product/${encodeURIComponent(productId)}`,
			{
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!resp.ok) {
			throw new Error(`Product fetch failed: ${resp.status}`);
		}
		try {
			return await resp.json();
		} catch (e) {
			throw new Error(`Product response was not valid JSON: ${e}`);
		}
	}

	// ── Checkout ───────────────────────────────────────────────────

	/** Initiate checkout — returns a payment URL to open in system browser. */
	async createCheckout(
		productId: string,
		deviceId: string,
		email: string,
	): Promise<CheckoutResponse> {
		const resp = await fetch(`${this.baseUrl}/v1/checkout`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				product_id: productId,
				device_id: deviceId,
				email,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!resp.ok) {
			const err = await resp.json().catch(() => ({}));
			throw new Error(err.detail?.message || `Checkout failed: ${resp.status}`);
		}
		return resp.json();
	}

	/** Poll for license after checkout. Returns the signed license when ready.
	 *
	 * Re-callable with the same orderRef: the backend keeps paid orders
	 * queryable indefinitely, so a timed-out poll can simply start over —
	 * no new checkout needed. For donations the resolved payload carries
	 * `{donated: true}` instead of a license.
	 */
	async pollForLicense(
		orderRef: string,
		deviceId?: string,
	): Promise<Record<string, unknown>> {
		const last = LICENSE_POLL_MAX_ATTEMPTS - 1;
		const ref = encodeURIComponent(orderRef);
		const deviceQuery = deviceId
			? `?device_id=${encodeURIComponent(deviceId)}`
			: "";
		for (let i = 0; i < LICENSE_POLL_MAX_ATTEMPTS; i++) {
			await new Promise((r) => setTimeout(r, LICENSE_POLL_INTERVAL_MS));
			let resp: Response;
			try {
				resp = await fetch(
					`${this.baseUrl}/v1/webhook/license/${ref}${deviceQuery}`,
					{
						signal: AbortSignal.timeout(10_000),
					},
				);
			} catch (e) {
				// Network error — retry while attempts remain.
				if (i === last) {
					throw e;
				}
				continue;
			}
			if (resp.ok) {
				try {
					return await resp.json();
				} catch (e) {
					debug.warn("license poll returned invalid JSON, retrying", e);
					continue;
				}
			}
			if (resp.status === 402 || resp.status >= 500) {
				// Not paid yet, or transient server error — keep polling.
				continue;
			}
			// Other 4xx: permanent (unknown order, bad request) — fail fast.
			throw new Error(`License fetch failed: ${resp.status}`);
		}
		throw new Error(
			"Payment not confirmed yet — your order is still open, finish paying in the browser and use Check again.",
		);
	}

	// ── License install ────────────────────────────────────────────

	/** Install a signed license into the local backend via existing IPC. */
	async installLicense(signedLicense: Record<string, unknown>): Promise<void> {
		await apiClient.installLicense(signedLicense);
	}

	// ── Donations ────────────────────────────────────────────────

	/** Start a custom-amount donation. No catalog product, no license. */
	async createDonation(
		amountUsd: number,
		deviceId: string,
		email: string,
	): Promise<{
		order_ref: string;
		checkout_url: string;
		amount_usd: number;
		donation: boolean;
	}> {
		const resp = await fetch(`${this.baseUrl}/v1/checkout/donate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: deviceId,
				email,
				amount_usd: amountUsd,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!resp.ok) {
			const err = await resp.json().catch(() => ({}));
			throw new Error(err.detail?.message || `Donation failed: ${resp.status}`);
		}
		return resp.json();
	}

	// ── Region & Currency ──────────────────────────────────

	async detectRegion(): Promise<RegionResponse> {
		const resp = await fetch(`${this.baseUrl}/v1/catalog/region`, {
			signal: AbortSignal.timeout(5_000),
		});
		if (!resp.ok) {
			// Fallback to US
			return {
				country_code: "US",
				currency: "USD",
				country_name: "United States",
			};
		}
		return resp.json();
	}

	async convertPrice(
		amountUsd: number,
		currency: string,
	): Promise<ConvertedPrice> {
		const resp = await fetch(`${this.baseUrl}/v1/catalog/convert-price`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ amount_usd: amountUsd, currency }),
			signal: AbortSignal.timeout(5_000),
		});
		if (!resp.ok) {
			return {
				amount: amountUsd,
				currency: "USD",
				rate: 1,
				formatted: `$${amountUsd.toFixed(2)}`,
			};
		}
		return resp.json();
	}

	// ── Tax Preview ───────────────────────────────────────────────

	/** Preview tax calculation for a product before checkout. */
	async previewTax(
		amountUsd: number,
		countryCode: string,
		productId: string = "",
	): Promise<TaxPreview> {
		const resp = await fetch(`${this.baseUrl}/v1/catalog/tax/preview`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				amount_usd: amountUsd,
				country_code: countryCode,
				product_id: productId,
			}),
			signal: AbortSignal.timeout(5_000),
		});
		if (!resp.ok) {
			// Fallback: no tax
			return {
				subtotal: amountUsd,
				tax_amount: 0,
				tax_rate: 0,
				tax_name: "Tax",
				country_code: countryCode,
				total: amountUsd,
				estimated: true,
			};
		}
		return resp.json();
	}

	// ── Ratings ───────────────────────────────────────────────────
	async fetchReviews(
		productId: string,
	): Promise<
		Array<{ id: number; rating: number; comment: string; created_at: string }>
	> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/product/${productId}/reviews`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!resp.ok) {
			throw new Error(`Reviews fetch failed: ${resp.status}`);
		}
		return resp.json();
	}
	async postReview(
		productId: string,
		rating: number,
		comment: string,
		deviceId: string,
	): Promise<void> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/product/${productId}/reviews`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ rating, comment, device_id: deviceId }),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!resp.ok) {
			const err = await resp.json().catch(() => ({}));
			throw new Error(err.detail?.message || `Review failed: ${resp.status}`);
		}
	}

	// ── Wishlist ───────────────────────────────────────────────────
	async fetchWishlist(deviceId: string): Promise<{ product_ids: string[] }> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/wishlist?device_id=${encodeURIComponent(deviceId)}`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!resp.ok) {
			throw new Error(`Wishlist fetch failed: ${resp.status}`);
		}
		return resp.json();
	}
	async addWishlist(productId: string, deviceId: string): Promise<void> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`,
			{ method: "POST", signal: AbortSignal.timeout(10_000) },
		);
		if (!resp.ok) {
			throw new Error(`Wishlist add failed: ${resp.status}`);
		}
	}
	async removeWishlist(productId: string, deviceId: string): Promise<void> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`,
			{ method: "DELETE", signal: AbortSignal.timeout(10_000) },
		);
		if (!resp.ok) {
			throw new Error(`Wishlist remove failed: ${resp.status}`);
		}
	}
}

// Singleton
export const marketplaceClient = new MarketplaceClient();

/**
 * Generate a device ID for license binding.
 * Uses a simple fingerprint stored in localStorage.
 */
let inMemoryDeviceId = "";
export function getDeviceId(): string {
	const key = "21labs_device_id";
	try {
		let id = localStorage.getItem(key);
		if (!id) {
			// Simple fingerprint: random UUID stored persistently
			try {
				id = crypto.randomUUID();
			} catch {
				id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
			}
			localStorage.setItem(key, id);
		}
		return id;
	} catch (e) {
		// Private-mode/blocked storage or non-secure context — fall back to memory.
		debug.warn("getDeviceId storage unavailable, using in-memory id", e);
		if (!inMemoryDeviceId) {
			try {
				inMemoryDeviceId = crypto.randomUUID();
			} catch {
				inMemoryDeviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
			}
		}
		return inMemoryDeviceId;
	}
}

/**
 * Open a URL in the system browser.
 * Uses Tauri shell plugin when available (opens in real browser),
 * falls back to window.open for web mode.
 */
export async function openExternalUrl(url: string): Promise<void> {
	try {
		const { open } = await import("@tauri-apps/plugin-shell");
		await open(url);
		return;
	} catch {
		// Not in Tauri (web mode) — fall through to window.open.
	}
	const win = window.open(url, "_blank", "noopener");
	if (!win) {
		// Popup blocked — surface the URL so the caller can show a copyable link.
		throw new Error(`Popup blocked — open this URL manually: ${url}`);
	}
}
