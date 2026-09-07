import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy - Otoyin Marketplace',
  description: 'When you can get a refund and how to request one.',
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: 'The short version',
    body: [
      'You can get a full refund within 14 days of purchase if the product has not been downloaded. Refunds are processed by Paddle, our Merchant of Record — you request through them, not through us directly.',
    ],
  },
  {
    heading: 'Eligibility',
    body: [
      'Within 14 days. Refund requests must be made within 14 calendar days of your purchase date.',
      'Not downloaded. The product must not have been downloaded or activated on your device. Once a model, voice pack, or plugin file has been downloaded to your machine, it is no longer eligible for a refund — the license is considered consumed.',
      'Verified through Paddle. Paddle\'s transaction records determine whether a download occurred. Their records are the source of truth for refund eligibility.',
    ],
  },
  {
    heading: 'How to request a refund',
    body: [
      'All refunds are handled by Paddle, our Merchant of Record. You do not need to contact us — Paddle processes refunds directly.',
      'To request a refund:',
      '1. Open the confirmation email you received after your purchase.',
      '2. Click the "View receipt" or "Manage subscription" link.',
      '3. Select "Request refund" and follow the prompts.',
      'Alternatively, visit paddle.net and select "Request refund".',
      'Refunds are processed using your original payment method within 14 days of approval.',
    ],
  },
  {
    heading: 'Regional consumer rights',
    body: [
      'Where local consumer protection laws grant additional rights, those rights apply and may override the terms above. Paddle applies the highest standard of protection for your region:',
      'EU / EEA / UK: 14-day statutory right to withdraw from digital content purchases. This right is waived if you download the product with express consent before the 14-day period expires.',
      'Turkey / Israel: 14-day statutory withdrawal right.',
      'South Korea / Brazil / China: 7-day unconditional cancellation right.',
      'Canada: 7-day unconditional cancellation right.',
      'Singapore: 5-day unconditional cancellation right.',
      'For all other regions, the standard Otoyin policy above (14 days, not downloaded) applies.',
    ],
  },
  {
    heading: 'Technical issues',
    body: [
      'If a product has a material defect that prevents it from working as described — for example, a voice pack that fails to load, a model that crashes the app, or a plugin that does not function — contact us first at support@otoyin.app so we can attempt to resolve it.',
      'If the issue cannot be resolved, Paddle will issue a refund in accordance with applicable consumer protection laws, even if the product has been downloaded.',
    ],
  },
  {
    heading: 'What is not refundable',
    body: [
      'Products that have been downloaded to your device and are functioning as described.',
      'Products used to generate output (audio, voice, music) — the license is considered consumed once the tool has been used.',
      'Free products and starter packs — no payment was made, so no refund applies.',
    ],
  },
  {
    heading: 'Chargebacks',
    body: [
      'We encourage you to request a refund through Paddle before initiating a chargeback with your bank or card issuer. Chargebacks that are found to be fraudulent or abusive may result in suspension of your Otoyin account and licenses.',
    ],
  },
  {
    heading: 'Not legal advice',
    body: [
      'This policy is a plain-language summary. Your statutory consumer rights — wherever you live — always take precedence over anything written here. If you need legal certainty, consult a qualified attorney.',
    ],
  },
];

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Refund Policy</h1>
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
            or request a refund directly at{' '}
            <a href="https://paddle.net" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
              paddle.net
            </a>.
          </p>
        </div>
      </div>
    </main>
  );
}
