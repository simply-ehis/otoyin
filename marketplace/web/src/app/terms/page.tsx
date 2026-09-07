import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - Otoyin Marketplace',
  description: 'What you are buying, what you can do with it, and what you cannot.',
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: 'What this document is',
    body: [
      'These Terms of Service ("Terms") are the agreement between you ("you", "buyer") and Otoyin ("we", "us", "the supplier") for any product purchased through the Otoyin Marketplace.',
      'Payments are processed by Paddle.com, our Merchant of Record. Paddle\'s own Buyer Terms also apply to your purchase — they cover payment processing, tax collection, chargebacks, and dispute resolution. Where there is any conflict between these Terms and Paddle\'s Buyer Terms, Paddle\'s Buyer Terms prevail for matters they cover.',
      'By completing a purchase on the Otoyin Marketplace, you agree to both these Terms and Paddle\'s Buyer Terms.',
    ],
  },
  {
    heading: 'What you are buying',
    body: [
      'When you purchase a product from the Otoyin Marketplace, you are buying a license to use that specific product — a model pack, voice pack, plugin, or other asset distributed through the Marketplace. You are not buying the underlying intellectual property, source code, or ownership of the product itself.',
      'Each purchase grants you a perpetual, non-exclusive license to use the product within the Otoyin application — meaning you can use it forever, but we retain ownership and can license it to others.',
      'Important: The Otoyin application itself is open source software governed by its own license (see the app repository). These Terms apply only to proprietary products purchased from the Marketplace, not to the open source application code.',
    ],
  },
  {
    heading: 'How the license works',
    body: [
      'Per-user license. Each purchase is tied to one (1) active user. The license is verified through device authentication — the Otoyin app checks with our servers to confirm your purchase is active.',
      'One active device at a time. Your license activates on one device. If you want to use the product on a new device, you can transfer your license — but only once every 20 calendar days. The previous device is deactivated when the transfer completes.',
      'Commercial use permitted. You can use purchased products to generate audio, voice, music, and other output for commercial purposes — including selling that output, using it in products, or incorporating it into client work. The license covers the tool; what you create with it is yours.',
    ],
  },
  {
    heading: 'What you cannot do',
    body: [
      'Redistribute or resell Marketplace products. You cannot share, sell, sublicense, or redistribute product files downloaded from the Marketplace (model weights, voice packs, plugins, or any other downloaded assets) to third parties — whether standalone, bundled, or embedded in another application.',
      'Extract Marketplace products for use outside Otoyin. You cannot extract model files, voice data, or plugin binaries that you downloaded from the Marketplace to use them in competing software, scripts, or services. This restriction applies to Marketplace-distributed assets, not to the open source application code.',
      'Reverse engineer Marketplace products for IP extraction. You may reverse engineer for interoperability purposes where permitted by applicable law, but not to replicate, clone, or extract the core intellectual property of Marketplace products.',
      'Circumvent device limits. You may not use automated tools, shared accounts, or other methods to use Marketplace products on more devices than your license allows.',
    ],
  },
  {
    heading: 'Product availability and changes',
    body: [
      'We may add, update, or remove products from the Marketplace at any time. If we remove a product you purchased, your license to use the last version you downloaded remains valid — we will not revoke access to something you already have.',
      'We may update products with bug fixes, improvements, or new features. These updates are included in your license at no extra cost.',
    ],
  },
  {
    heading: 'Warranty and liability',
    body: [
      'Products are provided "as is". We do not guarantee that any product will be error-free, uninterrupted, or suitable for every use case. To the maximum extent permitted by law, we disclaim all warranties — express, implied, or statutory — including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.',
      'Our total liability for any purchase is limited to the amount you paid for that product. We are not liable for indirect, incidental, consequential, or special damages — including lost profits, lost data, or business interruption — arising from your use of or inability to use a product.',
      'Nothing in these Terms excludes liability for fraud, gross negligence, or any liability that cannot be excluded under applicable law.',
    ],
  },
  {
    heading: 'Privacy',
    body: [
      'The Otoyin app runs offline on your device — your audio, voices, and projects never leave your machine. The Marketplace only processes your email (for receipts), order history, and device identifier (for license verification). See our Privacy Policy for full details.',
    ],
  },
  {
    heading: 'Changes to these Terms',
    body: [
      'We may update these Terms from time to time. If we make material changes, we will notify you via email or in-app notification before the changes take effect. Your continued use of products after changes take effect constitutes acceptance of the updated Terms.',
      'If you do not agree to updated Terms, you may stop using the affected product. Your rights for purchases made before the change are governed by the Terms in effect at the time of purchase.',
    ],
  },
  {
    heading: 'Governing law and disputes',
    body: [
      'These Terms are governed by the laws of the jurisdiction where you reside. For dispute resolution, Paddle\'s Buyer Terms govern the process — contact Paddle support through paddle.net for payment-related disputes, or reach us directly for product-related issues.',
    ],
  },
  {
    heading: 'Not legal advice',
    body: [
      'This document is a plain-language summary of our commercial terms, not a substitute for professional legal counsel. If you need legal certainty for your specific situation — especially for commercial use, regulated industries, or large-scale deployments — consult a qualified attorney before relying on these Terms.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: September 7, 2026
        </p>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold mb-3">{section.heading}</h2>
              <div className="space-y-2">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Questions? Contact us at{' '}
            <a href="mailto:support@otoyin.app" className="underline hover:text-foreground">
              support@otoyin.app
            </a>{' '}
            or visit{' '}
            <a href="https://paddle.net" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              paddle.net
            </a>{' '}
            for payment and refund support.
          </p>
        </div>
      </div>
    </main>
  );
}
