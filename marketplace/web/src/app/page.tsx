import { Metadata } from 'next';
import { HeroSection } from '@/components/home/HeroSection';
import { FeaturedOffers } from '@/components/home/FeaturedOffers';
import { CategoryGrid, DEFAULT_CATEGORIES } from '@/components/home/CategoryGrid';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';

export const metadata: Metadata = {
  title: '21labs Marketplace - AI Models for Voice, Music & Transcription',
  description: 'Buy, download, and manage AI models for voice, music, and transcription. All models run locally, offline.',
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <FeaturedOffers />
      <CategoryGrid categories={DEFAULT_CATEGORIES} />
      <FeaturedProducts />
    </main>
  );
}