'use client';

import { useMarketplace } from '@/hooks/useMarketplace';
import { ProductCard } from '@/components/catalog/ProductCard';

export function FeaturedProducts() {
  const { products, isLoading } = useMarketplace();
  
  // Show top-rated free and paid products
  const featured = products
    .filter(p => p.quality_score >= 7)
    .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
    .slice(0, 8);

  if (featured.length === 0) return null;

  return (
    <section className="py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Top Rated Models</h2>
            <p className="text-muted-foreground mt-1">Highest quality models as rated by the community</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div className="group relative rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 bg-muted rounded" />
        <div className="h-3 w-1/2 bg-muted rounded" />
        <div className="h-3 w-1/4 bg-muted rounded" />
        <div className="flex gap-2 mt-4">
          <div className="h-5 w-16 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}