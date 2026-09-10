import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo } from "react";
import { apiClient } from "@/lib/api/client";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Badge, Spinner } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import { ProductActions } from "./ProductActions";
import { ProductReviews } from "./ProductReviews";
import { ProductSpecs } from "./ProductSpecs";
import { SimilarProducts } from "./SimilarProducts";
import { StarRating } from "./StarRating";
import {
	compareQualityDesc,
	getCapabilityChips,
	getDisplayDescription,
} from "./storeUtils";

interface Props {
	product: MarketplaceProduct | null;
	model?: ModelStatus;
	owned: boolean;
	installed: boolean;
	/** Catalog `local_status` annotation — same disk manifest `installed` reads. */
	localStatus?: "cached" | "not_downloaded";
	downloadTask?: ActiveDownloadTask;
	isDownloading: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onProductChange?: (product: MarketplaceProduct) => void;
	onDownload: (id: string) => Promise<unknown> | unknown;
	onCancel: (id: string) => void;
	onDelete: (id: string) => void;
	/** One-step Activate for cached models (loadModel). */
	activating?: boolean;
	onActivate?: (id: string) => void;
}

export const StoreDetailModal = memo(function StoreDetailModal({
	product,
	model,
	owned,
	installed,
	localStatus,
	downloadTask,
	isDownloading,
	open,
	onOpenChange,
	onProductChange,
	onDownload,
	onCancel,
	onDelete,
	activating,
	onActivate,
}: Props) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (open) {
			void queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
			void queryClient.invalidateQueries({
				queryKey: ["marketplace", "entitlements"],
			});
		}
	}, [open, queryClient]);

	// Fetch catalog for similar products
	const catalog = useQuery({
		queryKey: ["marketplace", "catalog"],
		queryFn: () => apiClient.getCatalog(),
		staleTime: 1000 * 60 * 10,
	});
	const products = catalog.data?.products ?? [];

	// Similar products (same category, excluding self). Hooks must run
	// unconditionally — this sits above the early return.
	const similarProducts = useMemo(() => {
		if (!product) {
			return [];
		}
		return products
			.filter((p) => p.category === product.category && p.id !== product.id)
			.sort(compareQualityDesc)
			.slice(0, 3);
	}, [product, products]);

	if (!product) {
		return null;
	}

	const description = getDisplayDescription(product, model);
	// Disk truth: the catalog annotation and/or the live model-status signal
	// (both read the same manifest — they never contradict each other).
	const cached =
		installed || product.local_status === "cached" || localStatus === "cached";
	// Owned (licensed) but not on this device yet — one-step install.
	const ownedNotInstalled = owned && !cached;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
				<ProductSpecs
					product={product}
					model={model}
					description={description}
					cached={cached}
					ownedNotInstalled={ownedNotInstalled}
					onClose={() => onOpenChange(false)}
				/>

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
					{/* quick specs */}
					<div className="grid grid-cols-3 gap-2 text-xs">
						<div className="rounded-lg border bg-secondary px-3 py-2">
							<div className="uppercase tracking-wider text-muted-foreground">
								License
							</div>
							<div className="mt-0.5 font-medium text-foreground">
								{product.paid ? "Paid · one-time" : "Free · Open"}
							</div>
						</div>
						<div className="rounded-lg border bg-secondary px-3 py-2">
							<div className="uppercase tracking-wider text-muted-foreground">
								Runs
							</div>
							<div className="mt-0.5 font-medium text-foreground">
								Local · Offline
							</div>
						</div>
						<div className="rounded-lg border bg-secondary px-3 py-2">
							<div className="uppercase tracking-wider text-muted-foreground">
								Quality
							</div>
							<div className="mt-0.5 font-medium text-foreground">
								{(product.quality_score ?? model?.quality_score) ? (
									<StarRating
										score={product.quality_score ?? model?.quality_score ?? 0}
										size="sm"
									/>
								) : (
									"—"
								)}
							</div>
						</div>
					</div>

					{model && (
						<div className="flex flex-wrap gap-2">
							{model.engine && <Badge tone="neutral">{model.engine}</Badge>}
							{model.category && (
								<Badge tone="neutral" className="capitalize">
									{model.category}
								</Badge>
							)}
							{getCapabilityChips(model).map((c) => (
								<Badge
									key={c.label}
									tone="neutral"
									className={cn(
										c.tone === "violet" && "border-accent/30 text-accent",
										c.tone === "amber" && "border-warning/30 text-warning-text",
									)}
								>
									{c.label}
								</Badge>
							))}
					</div>
				)}

				{/* download progress */}
				{isDownloading && downloadTask && (
					<div className="space-y-2 rounded-lg border border-warning/20 bg-warning-soft p-3">
						<div className="flex items-center gap-2 text-xs font-medium text-warning-text">
							<Spinner size="xs" />{" "}
							{downloadTask.progress
								? `Downloading ${downloadTask.filename ?? product.name}`
								: "Preparing download…"}
						</div>
						<Progress value={downloadTask.progress ?? 0} className="h-1.5" />
						<div className="text-xs text-muted-foreground">
							{downloadTask.current && downloadTask.total
								? `${(downloadTask.current / 1024 / 1024).toFixed(1)} / ${(downloadTask.total / 1024 / 1024).toFixed(1)} MB · ${(downloadTask.progress ?? 0).toFixed(0)}%`
								: downloadTask.progress
									? `${(downloadTask.progress ?? 0).toFixed(0)}%`
									: "Preparing download…"}
						</div>
					</div>
				)}

					{/* actions — single place to activate/buy/download/delete */}
					<div className="border-t pt-2">
						<ProductActions
							product={product}
							model={model}
							owned={owned}
							cached={cached}
							ownedNotInstalled={ownedNotInstalled}
							downloadTask={downloadTask}
							isDownloading={isDownloading}
							activating={activating}
							onActivate={onActivate}
							onDownload={onDownload}
							onCancel={onCancel}
							onDelete={onDelete}
							onDone={() => onOpenChange(false)}
						/>
					</div>

					{/* why buy callout */}
					{product.paid && !owned && !cached && (
						<div className="rounded-lg border border-border bg-card p-3">
							<div className="text-xs font-semibold text-foreground">
								Why makers buy this
							</div>
							<ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
								<li>Offline & private — your voice never leaves the device.</li>
								<li>One-time fee, no subscription, no cloud.</li>
								<li>
									Installed from this marketplace only — secure signed catalog.
								</li>
							</ul>
						</div>
					)}

					<ProductReviews product={product} open={open} />

					<SimilarProducts
						category={product.category}
						products={similarProducts}
						onProductChange={(sp) => onProductChange?.(sp)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
});
