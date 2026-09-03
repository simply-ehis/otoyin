'use client';

import Image from 'next/image';
import { Heart, Star, Download, ExternalLink, Tag, DollarSign, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketplaceProduct } from '@/lib/api';
import { useMarketplace } from '@/hooks/useMarketplace';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ui/star-rating';

interface ProductCardProps {
  product: MarketplaceProduct;
  compact?: boolean;
  onWishlistToggle?: (id: string) => void;
}

export function ProductCard({ product, compact = false, onWishlistToggle }: ProductCardProps) {
  const { wishlist } = useMarketplace();
  const wishlisted = wishlist.has(product.id);
  const installed = false;

  const discount = product.baseline_usd && product.baseline_usd > product.price_usd;
  const savings = product.baseline_usd ? product.baseline_usd - product.price_usd : 0;

  const categoryLabels: Record<string, string> = {
    tts: 'Voice',
    stt: 'Transcription',
    llm: 'LLM',
    vc: 'Voice Convert',
    music: 'Music & SFX',
    extras: 'Extras',
    packs: 'Packs',
  };

  if (compact) {
    return (
      <article className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-lg hover:border-primary/30">
        <div className="relative aspect-video bg-muted overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-2 left-2 right-2 flex gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onWishlistToggle?.(product.id);
              }}
              className="rounded-full p-1.5 transition-colors"
              aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart className="size-4" fill={wishlisted ? 'currentColor' : 'none'} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              product.paid
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            )}>
              {product.paid ? `$${product.price_usd}` : 'Free'}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{product.category}</span>
          </div>
          <h3 className="font-semibold text-sm leading-tight line-clamp-1">{product.name}</h3>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-muted-foreground">
              ${product.price_usd}
            </span>
            {product.avg_rating && product.avg_rating > 0 && (
              <span className="text-xs text-amber-400">{product.avg_rating.toFixed(1)} ★</span>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-xl hover:border-primary/30">
      <div className="relative aspect-video bg-muted overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWishlistToggle?.(product.id);
            }}
            className="rounded-full p-1.5 transition-colors"
            aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart className="size-4" fill={wishlisted ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>
        </div>
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.special_offer && product.offer_discount_pct > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
              <Sparkles className="size-2.5" />
              -{product.offer_discount_pct}%
            </span>
          )}
          {!product.paid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              Free
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant={product.paid ? 'default' : 'success'} className="text-[10px] h-5 px-2">
                {product.paid ? `$${product.price_usd}` : 'Free'}
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5 px-2 capitalize">
                {product.category}
              </Badge>
            </div>
            <h3 className="font-semibold text-sm leading-tight line-clamp-1">
              {product.name}
            </h3>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 mb-3">
          {product.long_description || product.description}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {product.avg_rating && product.avg_rating > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              <span className="font-medium">{product.avg_rating.toFixed(1)}</span>
              <span className="text-muted-foreground">({product.review_count || 0})</span>
            </span>
          )}
          {product.size_mb && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>{product.size_mb >= 1024 ? (product.size_mb / 1024).toFixed(1) + ' GB' : product.size_mb + ' MB'}</span>
            </span>
          )}
          {product.languages && product.languages.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {product.languages.slice(0, 3).join(', ')}
              {product.languages.length > 3 && `+${product.languages.length - 3}`}
            </Badge>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-foreground">
                {product.paid ? `$${product.price_usd}` : 'Free'}
              </span>
              {product.baseline_usd && product.baseline_usd > product.price_usd && (
                <>
                  <span className="text-sm text-muted-foreground line-through">
                    ${product.baseline_usd}
                  </span>
                  <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                    -{Math.round(((product.baseline_usd - product.price_usd) / product.baseline_usd) * 100)}%
                  </Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onWishlistToggle?.(product.id);
                }}
                className="p-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
                aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart className="h-4 w-4" fill={wishlisted ? 'currentColor' : 'none'} strokeWidth={2} />
              </button>
              <a
                href={`/catalog/${product.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Details
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
