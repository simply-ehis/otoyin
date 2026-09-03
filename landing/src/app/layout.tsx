import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Otoyin — AI Voice Studio | Open-Source TTS, Voice Cloning, Mixing',
  description:
    'Open-source AI voice studio. 15 TTS engines, voice cloning, editing, mixing, and AI-powered production. Premium models you own forever. No subscription.',
  openGraph: {
    title: 'Otoyin — AI Voice Studio',
    description: 'Open-source AI voice studio. 15 TTS engines, voice cloning, editing, mixing. Premium models you own forever.',
    type: 'website',
    siteName: 'Otoyin',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Otoyin — AI Voice Studio',
    description: 'Open-source AI voice studio. TTS, voice cloning, editing, mixing. Models you own forever.',
  },
  icons: { icon: '/logo.svg' },
  metadataBase: new URL('https://Otoyin.app'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
