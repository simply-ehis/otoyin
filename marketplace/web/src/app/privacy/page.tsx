import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - Otoyin Marketplace',
  description: 'What the Otoyin marketplace collects, why, and how to get your data exported or deleted.',
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: 'The short version',
    body: [
      'The Otoyin app itself runs offline on your machine — your audio, voices, and projects never leave your device. This policy covers only the marketplace website and checkout: the email you pay with, your order history, and the licenses tied to your devices.',
    ],
  },
  {
    heading: 'What we collect',
    body: [
      'Email address — provided at checkout so we can tie your purchase to you and send receipts.',
      'Order history — product, amount, date, and status for every purchase.',
      'Device identifiers — the app sends a random device ID with each purchase so licenses activate on your machines.',
      'Reviews and wishlist entries — only if you write or save them, tied to the same device ID.',
    ],
  },
  {
    heading: 'What we never see',
    body: [
      'Payment card and bank details go directly to Paddle, our Merchant of Record — they never touch our servers. Your audio, voice samples, generated clips, and projects stay on your device and are never uploaded.',
    ],
  },
  {
    heading: 'Why we keep it',
    body: [
      'To fulfill your purchase (issue and verify licenses), to handle refunds and support requests, and to meet tax and accounting record-keeping duties that come with selling software.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Order and license records are kept while your licenses are active, plus as long as tax law requires after that. Reviews and wishlist entries are kept until you ask us to remove them.',
    ],
  },
  {
    heading: 'Your rights — export and deletion',
    body: [
      'Email privacy@otoyin.app from the address you bought with and tell us whether you want a copy of your data or deletion. We reply within 30 days. Deletion removes your orders, licenses, reviews, and wishlist entries from our database; note that already-issued offline licenses on your own machines stop verifying once removed server-side only when the app next checks in.',
      'Paddle holds your payment records separately under its own policy — ask us and we will point you at the right place there too.',
    ],
  },
  {
    heading: 'Contact',
    body: ['Questions about this policy: privacy@otoyin.app.'],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <article className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-muted-foreground">Last updated: 2026-09-04</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        {SECTIONS.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-lg font-medium">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-2 text-sm leading-6 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <p className="mt-10 text-sm">
          <Link href="/" className="underline underline-offset-4">
            Back to the marketplace
          </Link>
        </p>
      </article>
    </main>
  );
}
