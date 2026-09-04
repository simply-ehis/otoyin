import { TagIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { Offer } from "@/lib/api/types";
import { useOffers } from "@/lib/hooks/useContent";
import { useContentStore } from "@/stores/contentStore";

function OfferCard({ offer }: { offer: Offer }) {
	const navigate = useNavigate();
	const claimed = useContentStore((s) => s.claimedOffers);
	const claim = useContentStore((s) => s.claimOffer);
	const [copied, setCopied] = useState(false);

	const isClaimed = claimed.includes(offer.id);

	const copyCode = async () => {
		if (!offer.promo_code) {
			return;
		}
		try {
			await navigator.clipboard.writeText(offer.promo_code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard blocked — no-op
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
			<div className="flex items-start justify-between gap-3">
				<h2 className="text-lg font-medium text-foreground">{offer.title}</h2>
				{offer.badge && (
					<span className="shrink-0 rounded-full bg-accent/15 px-3 py-0.5 text-xs font-medium text-accent">
						{offer.badge}
					</span>
				)}
			</div>
			<p className="text-sm text-muted-foreground">{offer.description}</p>

			{offer.discount_label && (
				<p className="text-sm font-semibold text-emerald-400">
					{offer.discount_label}
				</p>
			)}

			{offer.promo_code && (
				<div className="flex items-center gap-2">
					<code className="rounded bg-muted px-2 py-1 font-mono text-xs">
						{offer.promo_code}
					</code>
					<button
						type="button"
						onClick={copyCode}
						className="text-xs font-medium text-accent hover:underline"
					>
						{copied ? "Copied!" : "Copy code"}
					</button>
				</div>
			)}

			<div className="mt-1 flex items-center gap-2">
				{offer.cta && (
					<button
						type="button"
						onClick={() => navigate({ to: offer.cta?.to } as never)}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
					>
						{offer.cta.label}
					</button>
				)}
				{offer.promo_code && (
					<button
						type="button"
						disabled={isClaimed}
						onClick={() => claim(offer.id)}
						className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 disabled:opacity-50"
					>
						{isClaimed ? "Claimed" : "Mark as claimed"}
					</button>
				)}
			</div>
		</div>
	);
}

export function OffersPage() {
	const { data, isLoading } = useOffers();

	return (
		<div className="mx-auto max-w-4xl py-8">
			<header className="mb-6">
				<h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
					<TagIcon className="size-6" /> Special Offers
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Limited-time deals and promo codes for Otoyin.
				</p>
			</header>

			{isLoading && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner size="sm" /> Loading offers…
				</div>
			)}

			{!isLoading && (data?.length ?? 0) === 0 && (
				<div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
					No active offers right now — check back soon.
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{(data ?? []).map((offer) => (
					<OfferCard key={offer.id} offer={offer} />
				))}
			</div>
		</div>
	);
}
