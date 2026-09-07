import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Otoyin Marketplace',
  description: 'Buy, download, and manage AI models for voice, music, and transcription. All models run locally, offline.',
  keywords: ['AI models', 'TTS', 'voice cloning', 'speech synthesis', 'music generation', 'offline AI'],
  openGraph: {
    title: 'Otoyin Marketplace',
    description: 'Buy, download, and manage AI models for voice, music, and transcription.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f0f' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://marketplace.otoyin.app" />
        <link rel="dns-prefetch" href="https://marketplace.otoyin.app" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <footer className="border-t border-border py-6 mt-auto">
          <div className="max-w-7xl mx-auto px-6 flex items-center gap-6 text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} Otoyin</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}