import { TagIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Offer } from "@/lib/api/types";
import { useOffers } from "@/lib/hooks/useContent";
import { useContentStore } from "@/stores/contentStore";
import { Button } from "@/ui/button";
import { Badge, Spinner } from "@/ui/primitives";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

function OfferCard({ offer }: { offer: Offer }) {
	const navigate = useNavigate();
	const { toast } = useToast();
	const claimed = useContentStore((s) => s.claimedOffers);
	const claimOffer = useContentStore((s) => s.claimOffer);
	const [copied, setCopied] = useState(false);

	const isClaimed = claimed.includes(offer.id);

	async function copyCode() {
		if (!offer.promo_code) {
			return;
		}
		try {
			await navigator.clipboard.writeText(offer.promo_code);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			toast({
				title: "Copy blocked",
				description: "Select and copy the code manually.",
				variant: "destructive",
			});
		}
	}

	return (
		<div className="flex flex-col gap-3 rounded-md border border-border bg-card p-5">
			<div className="flex items-start justify-between gap-3">
				<h2 className="text-lg font-medium text-foreground">{offer.title}</h2>
				{offer.badge ? <Badge tone="accent">{offer.badge}</Badge> : null}
			</div>
			<p className="text-sm text-muted-foreground">{offer.description}</p>

			{offer.discount_label ? (
				<p className="text-sm font-semibold text-success-text">
					{offer.discount_label}
				</p>
			) : null}

			{offer.promo_code ? (
				<div className="flex items-center gap-2">
					<code className="rounded-sm bg-secondary px-2 py-1 font-mono text-xs text-foreground">
						{offer.promo_code}
					</code>
					<button
						type="button"
						className="rounded-sm text-xs font-medium text-accent transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => void copyCode()}
					>
						{copied ? "Copied!" : "Copy code"}
					</button>
				</div>
			) : null}

			<div className="mt-1 flex items-center gap-2">
				{offer.cta ? (
					<Button
						type="button"
						size="sm"
						className="h-8 text-xs"
						onClick={() => navigate({ to: offer.cta?.to } as never)}
					>
						{offer.cta.label}
					</Button>
				) : null}
				{offer.promo_code ? (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-8 text-xs"
						disabled={isClaimed}
						aria-pressed={isClaimed}
						onClick={() => claimOffer(offer.id)}
					>
						{isClaimed ? "Claimed" : "Mark as claimed"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

export function OffersPage() {
	const { data, isLoading } = useOffers();

	return (
		<div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader helpPath="/offers" title="Special Offers" />

			{isLoading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner size="xs" /> Loading offers…
				</div>
			) : null}

			{!isLoading && (data?.length ?? 0) === 0 ? (
				<EmptyState
					icon={<TagIcon className="size-6" aria-hidden="true" />}
					title="No active offers"
					body="Check back soon for deals and promo codes."
				/>
			) : null}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{(data ?? []).map((offer) => (
					<OfferCard key={offer.id} offer={offer} />
				))}
			</div>
		</div>
	);
}
