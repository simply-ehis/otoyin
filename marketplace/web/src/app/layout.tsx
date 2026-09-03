import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: '21labs Marketplace',
  description: 'Buy, download, and manage AI models for voice, music, and transcription. All models run locally, offline.',
  keywords: ['AI models', 'TTS', 'voice cloning', 'speech synthesis', 'music generation', 'offline AI'],
  openGraph: {
    title: '21labs Marketplace',
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
        <link rel="preconnect" href="https://marketplace.21labs.app" />
        <link rel="dns-prefetch" href="https://marketplace.21labs.app" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}