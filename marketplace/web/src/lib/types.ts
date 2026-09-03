import { MarketplaceProduct, Offer, Review, ReviewIn, WishlistOut } from '@/lib/api';

export type { MarketplaceProduct, Offer, Review, ReviewIn, WishlistOut };

export interface CatalogResponse {
  schema_version: number;
  signed_at: string;
  currency: string;
  products: MarketplaceProduct[];
  sig: string;
}

export interface MarketplaceError {
  code: string;
  message: string;
}

export interface DeviceId {
  id: string;
}

export interface DownloadProgress {
  model_name: string;
  filename: string;
  progress: number;
  current: number;
  total: number;
  status: 'downloading' | 'completed' | 'failed' | 'pending';
  speed?: number;
  eta?: number;
}

export interface ActiveTask {
  id: string;
  type: 'download' | 'generation' | 'training';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}