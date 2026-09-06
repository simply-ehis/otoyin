import type { MarketplaceProduct } from "@/lib/api/types";
import {
	convertUsd,
	formatMoney,
	useRegionCurrency,
} from "@/lib/regionCurrency";

interface Props {
	offers: MarketplaceProduct[];
	onOpen: (product: MarketplaceProduct) => void;
}

/** Special-offers strip: one banner slot per active offer, opens the detail. */
export function OffersBanner({ offers, onOpen }: Props) {
	const fx = useRegionCurrency();
	const localPrice = (usd: number) =>
		fx.currency === "USD"
			? `$${usd}`
			: formatMoney(convertUsd(usd, fx.rate), fx.currency, fx.locale);
	if (offers.length === 0) {
		return null;
	}
	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{offers.map((offer) => (
				<button
					key={offer.id}
					type="button"
					onClick={() => onOpen(offer)}
					className="flex items-center gap-3 rounded-xl border border-accent/25 bg-secondary px-4 py-3 text-left transition-colors hover:bg-secondary-hover"
				>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="truncate text-sm font-semibold text-foreground">
								{offer.name}
							</span>
							<span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-accent">
								Special
							</span>
						</div>
						<div className="truncate text-xs text-muted-foreground">
							Limited-time {localPrice(offer.price_usd)}
							{offer.baseline_usd
								? ` — was ${localPrice(offer.baseline_usd)} (${offer.discount_pct}% off)`
								: ""}
							{offer.note ? ` — ${offer.note}` : ""}
						</div>
					</div>
				</button>
			))}
		</div>
	);
}
