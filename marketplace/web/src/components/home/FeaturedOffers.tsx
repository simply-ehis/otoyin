'use client';

import { Sparkles, Tag, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/catalog/ProductCard';
import { useMarketplace } from '@/hooks/useMarketplace';

export function FeaturedOffers() {
  const { offers, isLoading } = useMarketplace();
  const offers_list = offers.filter(o => o.discount_pct > 0 && o.special_offer);

  if (offers_list.length === 0) return null;

  return (
    <section className="py-16 lg:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 text-fuchsia-500 text-xs font-medium mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-fuchsia-500"></span>
              </span>
              <span className="text-xs font-semibold">Limited Time Offers</span>
            </span>
            <h2 className="text-3xl font-bold tracking-tight">Featured Offers</h2>
            <p className="text-muted-foreground mt-1">Limited-time discounts on premium models</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <a href="/catalog?filter=offers">
              View All Offers <span className="ml-1">→</span>
            </a>
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4">
          {offers_list.map((offer) => (
            <div key={offer.id} className="flex-shrink-0 min-w-[320px] max-w-sm">
              <OfferCard offer={offer} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface OfferCardProps {
  offer: {
    id: string;
    name: string;
    price_usd: number;
    baseline_usd?: number;
    discount_pct: number;
    description: string;
    category: string;
  };
}

function OfferCard({ offer }: OfferCardProps) {
  const discount = offer.discount_pct;
  const baseline = offer.baseline_usd || offer.price_usd;
  const savings = baseline - offer.price_usd;

  return (
    <article className="flex flex-col min-w-[300px] max-w-sm flex-shrink-0 snap-start snap-always rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 bg-gradient-to-br from-fuchsia-500/5 via-transparent to-transparent p-6 hover:border-fuchsia-500/40 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-2.5 py-0.5 text-xs font-semibold text-fuchsia-500 border border-fuchsia-500/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-fuchsia-500"></span>
          </span>
          Special Offer
        </span>
        <span className="text-xs font-bold text-fuchsia-500 bg-fuchsia-500/10 px-2 py-0.5 rounded-full">
          -{offer.discount_pct}%
        </span>
      </div>
      
      <h3 className="font-semibold text-foreground text-lg mb-1 line-clamp-1">{offer.name}</h3>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{offer.description}</p>
      
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl font-bold text-foreground">${offer.price_usd}</span>
        {offer.baseline_usd && offer.baseline_usd > offer.price_usd && (
          <span className="text-sm text-muted-foreground line-through">${offer.baseline_usd}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
          Save ${offer.baseline_usd ? offer.baseline_usd - offer.price_usd : 0}
        </span>
      </div>
      
      <p className="text-xs text-muted-foreground mb-4 flex-1">{offer.description}</p>
      
      <a href={`/catalog/${offer.id}`} className="w-full">
        <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-fuchsia-500 text-white hover:bg-fuchsia-600 transition-colors">
          View Details
          <span className="h-4 w-4" aria-hidden="true">→</span>
        </button>
      </a>
    </article>
  );
}