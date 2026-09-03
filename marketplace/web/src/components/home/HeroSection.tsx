'use client';

import { ArrowRight, Sparkles, Download, Shield, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-32 xl:py-40 bg-gradient-to-b from-background via-background to-muted/30">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/10 blur-3xl" />
      </div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-in slide-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span>New: Qwen 3.8-27B UD-IQ2-S — Masterclass LLM at $80</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-foreground animate-in slide-up">
            The Marketplace for{' '}
            <span className="text-primary">Local-First AI Models</span>
          </h1>
          
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto animate-in slide-up delay-100">
            Buy, download, and run premium AI models locally. Voice synthesis, music generation, 
            transcription, and LLMs — all offline, no cloud required, one-time purchase.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-in slide-up delay-200">
            <Button asChild size="lg" className="gap-2 px-8 py-3 text-base">
              <Link href="/catalog">
                <span>Explore Catalog</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 px-8 py-3 text-base">
              <Link href="/catalog?category=free">
                <Download className="h-5 w-5" />
                <span>Free Models</span>
              </Link>
            </Button>
          </div>
          
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 animate-in slide-up delay-300">
            <StatCard 
              icon={<Shield className="h-6 w-6" />}
              value="100%"
              label="Offline & Private"
              description="Your data never leaves your device"
            />
            <StatCard 
              icon={<Download className="h-6 w-6" />}
              value="One-time"
              label="No Subscriptions"
              description="Buy once, use forever"
            />
            <StatCard 
              icon={<Globe className="h-6 w-6" />}
              value="49+"
              label="Models Available"
              description="Voice, Music, STT, LLM & more"
            />
            <StatCard 
              icon={<Sparkles className="h-6 w-6" />}
              value="48"
              label="Free Models"
              description="Start creating immediately"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  description: string;
}

function StatCard({ icon, value, label, description }: StatCardProps) {
  return (
    <div className="text-center p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/50 transition-colors">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <div className="text-3xl font-bold text-foreground">{value}</div>
      <div className="text-sm font-medium text-foreground mt-1">{label}</div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
