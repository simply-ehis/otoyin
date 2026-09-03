'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketplaceApi, MarketplaceProduct, Offer, Review } from '@/lib/api';
import { getDeviceId } from '@/lib/marketplace';

export function useMarketplace() {
  const queryClient = useQueryClient();

  // Catalog
  const { data: catalog, isLoading: isLoadingCatalog } = useQuery({
    queryKey: ['marketplace', 'catalog'],
    queryFn: () => marketplaceApi.getCatalog(),
    staleTime: 1000 * 60 * 10,
  });

  const products = catalog?.products ?? [];

  // Offers
  const { data: offers, isLoading: isLoadingOffers } = useQuery({
    queryKey: ['marketplace', 'offers'],
    queryFn: () => marketplaceApi.getOffers(),
    staleTime: 1000 * 60 * 10,
  });

  // Model status (for installed/downloaded status)
  const { data: modelStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['model-status'],
    queryFn: () => fetch('/api/models/status').then(r => r.json()).catch(() => ({ models: [] })),
    staleTime: 1000 * 30,
  });

  const models = modelStatus?.models ?? [];

  // Installed/owned models
  const installed = models
    .filter((m: any) => m.downloaded)
    .map((m: any) => m.model_name);

  const owned = models
    .filter((m: any) => m.entitled)
    .map((m: any) => m.engine);

  // Wishlist
  const deviceId = getDeviceId();
  const { data: wishlistData, isLoading: isLoadingWishlist } = useQuery({
    queryKey: ['marketplace', 'wishlist'],
    queryFn: async () => {
      try {
        const deviceId = getDeviceId();
        const response = await fetch(`/api/marketplace/catalog/wishlist?device_id=${encodeURIComponent(deviceId)}`);
        if (!response.ok) throw new Error('Failed to fetch wishlist');
        return response.json();
      } catch {
        return { product_ids: [] };
      }
    },
    staleTime: 60_000,
  });

  const wishlist = new Set(wishlistData?.product_ids ?? []);

  return {
    products,
    offers: offers ?? [],
    isLoading: isLoadingCatalog || isLoadingOffers,
    isLoadingCatalog,
    isLoadingOffers,
    installed: new Set(installed),
    owned: new Set(owned),
    wishlist,
    isLoadingWishlist,
    isLoadingStatus,
    refetchCatalog: () => queryClient.invalidateQueries({ queryKey: ['marketplace', 'catalog'] }),
  };
}

// Mutations
export function useAddToWishlist() {
  const queryClient = useQueryClient();
  const deviceId = getDeviceId();

  return useMutation({
    mutationFn: async (productId: string) => {
      await fetch(`/api/marketplace/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(deviceId)}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'wishlist'] });
    },
  });
}

export function useRemoveFromWishlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      await fetch(`/api/marketplace/catalog/wishlist/${encodeURIComponent(productId)}?device_id=${encodeURIComponent(getDeviceId())}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'wishlist'] });
    },
  });
}

export function usePostReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, rating, comment }: { productId: string; rating: number; comment: string }) => {
      await fetch(`/api/marketplace/catalog/product/${encodeURIComponent(productId)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment, device_id: getDeviceId() }),
      });
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'reviews', productId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'catalog'] });
    },
  });
}

export function useFetchReviews(productId: string) {
  return useQuery({
    queryKey: ['marketplace', 'reviews', productId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/catalog/product/${encodeURIComponent(productId)}/reviews`);
      if (!res.ok) throw new Error('Failed to fetch reviews');
      return res.json();
    },
    enabled: !!productId,
    staleTime: 60_000,
  });
}