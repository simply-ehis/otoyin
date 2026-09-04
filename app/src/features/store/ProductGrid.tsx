import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { StoreProductCard } from "./StoreProductCard";
import { CATEGORY_LABELS, getProductModelStatus } from "./storeUtils";

interface Props {
	groups: [string, MarketplaceProduct[]][];
	models: ModelStatus[] | undefined;
	owned: Set<string>;
	installed: Set<string>;
	localStatusById: Map<string, "cached" | "not_downloaded">;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	wishlist: Set<string>;
	pendingDownload: string | null;
	activatingId: string | null;
	onDetail: (p: MarketplaceProduct) => void;
	onQuickDownload: (id: string) => void;
	onCancel: (id: string) => void;
	onDelete: (id: string) => void;
	onActivate: (id: string) => void;
	onToggleWishlist: (id: string) => void;
}

/**
 * Category-grouped product grid. Translation packs stay collapsed behind a
 * section header (they are the only "pack" category in the catalog).
 */
export function ProductGrid({
	groups,
	models,
	owned,
	installed,
	localStatusById,
	downloadProgressMap,
	wishlist,
	pendingDownload,
	activatingId,
	onDetail,
	onQuickDownload,
	onCancel,
	onDelete,
	onActivate,
	onToggleWishlist,
}: Props) {
	const [translationExpanded, setTranslationExpanded] = useState(false);

	return (
		<div className="space-y-8">
			{groups.map(([category, items]) => {
				const isTranslation = category === "translation";
				if (isTranslation) {
					return (
						<section key={category}>
							<button
								type="button"
								onClick={() => setTranslationExpanded((v) => !v)}
								className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-secondary/50 transition-colors"
								aria-expanded={translationExpanded}
							>
								<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
									{CATEGORY_LABELS[category] ?? category} — {items.length} packs
								</span>
								<span className="text-xs text-muted-foreground">
									{translationExpanded ? (
										<ChevronDownIcon className="size-3.5" />
									) : (
										<ChevronRightIcon className="size-3.5" />
									)}
									{translationExpanded ? " Hide" : " Show"}
								</span>
							</button>
							{translationExpanded && (
								<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
									{items.map((p) => (
										<GridCard
											key={p.id}
											p={p}
											models={models}
											owned={owned}
											installed={installed}
											localStatusById={localStatusById}
											downloadProgressMap={downloadProgressMap}
											wishlist={wishlist}
											pendingDownload={pendingDownload}
											activatingId={activatingId}
											onDetail={onDetail}
											onQuickDownload={onQuickDownload}
											onCancel={onCancel}
											onDelete={onDelete}
											onActivate={onActivate}
											onToggleWishlist={onToggleWishlist}
										/>
									))}
								</div>
							)}
						</section>
					);
				}
				return (
					<section key={category || "all"}>
						{category && (
							<h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
								{CATEGORY_LABELS[category] ?? category}
							</h2>
						)}
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{items.map((p) => (
								<GridCard
									key={p.id}
									p={p}
									models={models}
									owned={owned}
									installed={installed}
									localStatusById={localStatusById}
									downloadProgressMap={downloadProgressMap}
									wishlist={wishlist}
									pendingDownload={pendingDownload}
									activatingId={activatingId}
									onDetail={onDetail}
									onQuickDownload={onQuickDownload}
									onCancel={onCancel}
									onDelete={onDelete}
									onActivate={onActivate}
									onToggleWishlist={onToggleWishlist}
								/>
							))}
						</div>
					</section>
				);
			})}
		</div>
	);
}

function GridCard({
	p,
	models,
	owned,
	installed,
	localStatusById,
	downloadProgressMap,
	wishlist,
	pendingDownload,
	activatingId,
	onDetail,
	onQuickDownload,
	onCancel,
	onDelete,
	onActivate,
	onToggleWishlist,
}: {
	p: MarketplaceProduct;
	models: ModelStatus[] | undefined;
	owned: Set<string>;
	installed: Set<string>;
	localStatusById: Map<string, "cached" | "not_downloaded">;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	wishlist: Set<string>;
	pendingDownload: string | null;
	activatingId: string | null;
	onDetail: (p: MarketplaceProduct) => void;
	onQuickDownload: (id: string) => void;
	onCancel: (id: string) => void;
	onDelete: (id: string) => void;
	onActivate: (id: string) => void;
	onToggleWishlist: (id: string) => void;
}) {
	const m = getProductModelStatus(p.id, models);
	const dl = downloadProgressMap.get(p.id);
	return (
		<StoreProductCard
			product={p}
			model={m}
			owned={owned.has(p.id)}
			installed={installed.has(p.id)}
			localStatus={localStatusById.get(p.id)}
			isDownloading={!!dl}
			downloadTask={dl}
			busy={pendingDownload === p.id}
			activating={activatingId === p.id}
			onActivate={onActivate}
			wishlisted={wishlist.has(p.id)}
			onToggleWishlist={onToggleWishlist}
			onDetail={onDetail}
			onQuickDownload={onQuickDownload}
			onCancel={onCancel}
			onDelete={onDelete}
		/>
	);
}
