/**
 * Marketplace client — talks directly to the remote marketplace server.
 *
 * Fetches catalog from marketplace.21labs.app, handles checkout, and
 * auto-installs licenses after payment. Falls back to bundled catalog
 * when offline.
 */
import { apiClient } from "./api/client";

// In development, use Vite proxy to local marketplace backend
// In production, use the actual marketplace URL
const isDev = import.meta.env.DEV;
const MARKETPLACE_URL = isDev ? "/api" : "https://marketplace.21labs.app";
const LICENSE_POLL_INTERVAL_MS = 3_000;
const LICENSE_POLL_MAX_ATTEMPTS = 20; // 1 min total polling

// ── Types ──────────────────────────────────────────────────────────

export interface MarketplaceProduct {
	id: string;
	name: string;
	category: string;
	description: string;
	long_description?: string;
	price_usd: number;
	paid: boolean;
	quality_score: number;
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
		return resp.json();
	}

	/** Get product by ID from remote catalog. */
	async getProduct(productId: string): Promise<MarketplaceProduct> {
		const resp = await fetch(
			`${this.baseUrl}/v1/catalog/product/${productId}`,
			{
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!resp.ok) {
			throw new Error(`Product fetch failed: ${resp.status}`);
		}
		return resp.json();
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

	/** Poll for license after checkout. Returns the signed license when ready. */
	async pollForLicense(orderRef: string): Promise<Record<string, unknown>> {
		for (let i = 0; i < LICENSE_POLL_MAX_ATTEMPTS; i++) {
			await new Promise((r) => setTimeout(r, LICENSE_POLL_INTERVAL_MS));
			try {
				const resp = await fetch(
					`${this.baseUrl}/v1/webhook/license/${orderRef}`,
					{
						signal: AbortSignal.timeout(10_000),
					},
				);
				if (resp.ok) {
					return resp.json();
				}
				// 402 = not paid yet, keep polling
				if (resp.status !== 402) {
					throw new Error(`License fetch failed: ${resp.status}`);
				}
			} catch (e) {
				if (i === LICENSE_POLL_MAX_ATTEMPTS - 1) {
					throw e;
				}
			}
		}
		throw new Error("License not available after timeout — check your email");
	}

	// ── License install ────────────────────────────────────────────

	/** Install a signed license into the local backend via existing IPC. */
	async installLicense(signedLicense: Record<string, unknown>): Promise<void> {
		await apiClient.installLicense(signedLicense);
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
export function getDeviceId(): string {
	const key = "21labs_device_id";
	let id = localStorage.getItem(key);
	if (!id) {
		// Simple fingerprint: random UUID stored persistently
		id = crypto.randomUUID();
		localStorage.setItem(key, id);
	}
	return id;
}

/**
 * Open a URL in the system browser.
 * Uses window.open as a fallback — works in Tauri webviews.
 */
export async function openExternalUrl(url: string): Promise<void> {
	window.open(url, "_blank");
}
