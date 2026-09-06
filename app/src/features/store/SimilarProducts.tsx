import type { MarketplaceProduct } from "@/lib/api/types";
import { useRegionCurrency } from "@/lib/regionCurrency";
import { StarRating } from "./StarRating";
import { formatPrice } from "./storeUtils";

interface Props {
	category: string;
	products: MarketplaceProduct[];
	onProductChange: (product: MarketplaceProduct) => void;
}

/** "Also in {category}" list inside the detail modal. */
export function SimilarProducts({
	category,
	products,
	onProductChange,
}: Props) {
	const fx = useRegionCurrency();
	if (products.length === 0) {
		return null;
	}
	return (
		<div className="space-y-2">
			<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Also in {category}
			</h4>
			<div className="space-y-1.5">
				{products.map((sp) => (
					<button
						key={sp.id}
						type="button"
						className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-secondary px-3 py-2 text-left hover:bg-secondary-hover transition-colors"
						onClick={() => onProductChange(sp)}
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate text-xs font-medium text-foreground">
									{sp.name}
								</span>
								{sp.paid ? (
									<span className="text-xs font-semibold text-warning-text">
										{formatPrice(sp, fx)}
									</span>
								) : (
									<span className="text-xs font-medium text-success-text">
										Free
									</span>
								)}
							</div>
							{sp.quality_score != null && (
								<StarRating
									score={sp.quality_score}
									size="xs"
									className="mt-0.5"
								/>
							)}
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
