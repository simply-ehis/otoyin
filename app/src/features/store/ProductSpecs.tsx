import {
	CheckBadgeIcon,
	KeyIcon,
	SparklesIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import type { MarketplaceProduct, ModelStatus } from "@/lib/api/types";
import { useRegionCurrency } from "@/lib/regionCurrency";
import { Button } from "@/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { CATEGORY_LABELS, formatPrice, formatSize } from "./storeUtils";

interface Props {
	product: MarketplaceProduct;
	model?: ModelStatus;
	description: string;
	cached: boolean;
	ownedNotInstalled: boolean;
	onClose: () => void;
}

/**
 * Detail-modal header section: title + description + the three per-product
 * state chips (Installed / Owned / price-or-free). The spec grid, engine
 * badges and download progress live in the modal body so the dialog has
 * exactly one scroll area.
 */
export function ProductSpecs({
	product,
	model,
	description,
	cached,
	ownedNotInstalled,
	onClose,
}: Props) {
	const fx = useRegionCurrency();
	return (
		<div className="relative border-b px-6 pb-4 pt-6">
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onClick={onClose}
				className="absolute right-4 top-4"
				title="Close"
				aria-label="Close"
			>
				<XMarkIcon className="size-4" />
			</Button>
			<DialogHeader className="pr-8 text-left">
				<DialogTitle className="text-xl leading-tight">
					{product.name}
				</DialogTitle>
				<DialogDescription className="mt-1 line-clamp-2 text-xs">
					{description}
				</DialogDescription>
			</DialogHeader>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				{product.paid ? (
					<span className="rounded-full border border-warning/40 bg-warning-soft px-3 py-1 text-xs font-bold text-warning-text">
						{formatPrice(product, fx)}
					</span>
				) : (
					<span className="rounded-full border border-success/40 bg-success-soft px-3 py-1 text-xs font-semibold text-success-text">
						Free
					</span>
				)}
				{product.special_offer && (
					<span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-secondary px-3 py-1 text-xs font-semibold text-accent">
						<SparklesIcon className="size-3.5" /> Special offer
					</span>
				)}
				<span className="rounded-full border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground">
					{CATEGORY_LABELS[product.category] ?? product.category}
				</span>
				{model?.license_id && (
					<span
						className={model.commercial_use === false ? "rounded-full border border-destructive/40 bg-destructive-soft px-2 py-1 text-xs font-semibold text-destructive" : "rounded-full border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground"}
						title={model.license_note || model.license_id}
					>
						{model.commercial_use === false ? "Non-commercial" : model.license_id}
					</span>
				)}
				{model?.size_mb && (
					<span className="text-xs text-muted-foreground">
						{formatSize(model.size_mb)} on disk
					</span>
				)}
				{cached ? (
					<span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-text">
						<CheckBadgeIcon className="size-3.5" /> Installed
					</span>
				) : ownedNotInstalled ? (
					<span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-info-soft px-2.5 py-1 text-xs font-semibold text-info-text">
						<KeyIcon className="size-3.5" /> Owned — install on this device
					</span>
				) : null}
			</div>
		</div>
	);
}
