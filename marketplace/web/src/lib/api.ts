const API_BASE = process.env.NEXT_PUBLIC_MARKETPLACE_API_URL || 'http://localhost:8420';

class MarketplaceApi {
  private baseUrl: string;

  constructor(baseUrl: string = '/api/marketplace') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Catalog
  async getCatalog(): Promise<{ products: MarketplaceProduct[]; schema_version: number; currency: string; sig: string }> {
    return this.request('/catalog');
  }

  async getProduct(id: string): Promise<MarketplaceProduct> {
    return this.request(`/catalog/product/${id}`);
  }

  async getOffers(): Promise<Offer[]> {
    return this.request('/catalog/offers');
  }

  async getRecommendations(): Promise<MarketplaceProduct[]> {
    return this.request('/catalog/recommended');
  }

  // Wishlist
  async getWishlist(deviceId: string): Promise<{ product_ids: string[] }> {
    return this.request(`/catalog/wishlist?device_id=${encodeURIComponent(deviceId)}`);
  }

  async addToWishlist(productId: string, deviceId: string): Promise<void> {
    await this.request(`/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'POST',
    });
  }

  async removeFromWishlist(productId: string, deviceId: string): Promise<void> {
    await this.request(`/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });
  }

  // Reviews
  async getReviews(productId: string): Promise<Review[]> {
    return this.request(`/catalog/product/${productId}/reviews`);
  }

  async postReview(productId: string, rating: number, comment: string, deviceId: string): Promise<void> {
    await this.request(`/catalog/product/${encodeURIComponent(productId)}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment, device_id: deviceId }),
    });
  }

  // Download/Generate
  async triggerDownload(productId: string): Promise<{ task_id: string }> {
    return this.request(`/models/download`, {
      method: 'POST',
      body: JSON.stringify({ model_name: productId }),
    });
  }
}

export const marketplaceApi = new MarketplaceApi();

// Types
export interface MarketplaceProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  long_description?: string;
  price_usd: number;
  baseline_usd?: number;
  paid: boolean;
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

export interface Offer {
  id: string;
  name: string;
  category: string;
  description: string;
  price_usd: number;
  baseline_usd: number;
  discount_pct: number;
  special_offer: boolean;
}

export interface Review {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
}

export interface ReviewIn {
  rating: number;
  comment: string;
  device_id: string;
}

export interface WishlistOut {
  product_ids: string[];
}