export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr-placeholder';
  const key = '21labs_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export async function openExternalUrl(url: string): Promise<void> {
  window.open(url, '_blank');
}

export const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? 'http://localhost:8420';
const LICENSE_POLL_INTERVAL_MS = 3_000;
const LICENSE_POLL_MAX_ATTEMPTS = 20; // 1 min total polling

export interface MarketplaceProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  long_description?: string;
  price_usd: number;
  baseline_usd?: number;
  paid: boolean;
  coming_soon?: boolean;
  quality_score: number;
  avg_rating?: number;
  review_count?: number;
  size_mb?: number;
  languages?: string[];
  license?: string;
  use_cases?: string[];
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
}

export interface LicenseRecord {
  license_key: string;
  signature: string;
  product_id: string;
  expires_at?: string;
}

class MarketplaceClient {
  private baseUrl: string;

  constructor(baseUrl: string = `${MARKETPLACE_URL.replace(/\/+$/, '')}/v1`) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async fetchCatalog(): Promise<{ products: MarketplaceProduct[]; schema_version: number; currency: string; sig: string }> {
    return this.request('/catalog');
  }

  async getProduct(productId: string): Promise<MarketplaceProduct> {
    const response = await fetch(`${this.baseUrl}/catalog/product/${productId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Product fetch failed: ${response.status}`);
    }
    return response.json();
  }

  async fetchReviews(productId: string): Promise<Array<{ id: number; rating: number; comment: string; created_at: string }>> {
    const resp = await fetch(`${this.baseUrl}/catalog/product/${productId}/reviews`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      throw new Error(`Reviews fetch failed: ${resp.status}`);
    }
    return resp.json();
  }

  async postReview(productId: string, rating: number, comment: string, deviceId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/catalog/product/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment, device_id: deviceId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail?.message || `Review failed: ${resp.status}`);
    }
  }

  async fetchWishlist(deviceId: string): Promise<{ product_ids: string[] }> {
    const resp = await fetch(`${this.baseUrl}/catalog/wishlist?device_id=${encodeURIComponent(deviceId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`Wishlist fetch failed: ${resp.status}`);
    return resp.json();
  }

  async addWishlist(productId: string, deviceId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`Wishlist add failed: ${resp.status}`);
  }

  async removeWishlist(productId: string, deviceId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`Wishlist remove failed: ${resp.status}`);
  }

  async createCheckout(productId: string, deviceId: string, email: string): Promise<{ order_ref: string; checkout_url: string }> {
    const resp = await fetch(`${this.baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, device_id: deviceId, email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail?.message || `Checkout failed: ${resp.status}`);
    }
    return resp.json();
  }

  async pollForLicense(orderRef: string): Promise<Record<string, unknown>> {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const resp = await fetch(`${this.baseUrl}/webhook/license/${orderRef}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) return resp.json();
        if (resp.status !== 402) throw new Error(`License fetch failed: ${resp.status}`);
      } catch (e) {
        if (i === 19) throw e;
      }
    }
    throw new Error('License not available after timeout');
  }

  async installLicense(signedLicense: Record<string, unknown>): Promise<void> {
    await fetch('/api/install-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedLicense),
    });
  }
}

export const marketplaceClient = new MarketplaceClient();
