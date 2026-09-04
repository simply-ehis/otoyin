import {
	ArrowDownTrayIcon,
	CheckBadgeIcon,
	HeartIcon,
	KeyIcon,
	SparklesIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolid } from "@heroicons/react/24/solid";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/Spinner";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { StarRating } from "./StarRating";
import {
	CATEGORY_ACCENT,
	formatSize,
	getCapabilityChips,
	getDisplayDescription,
} from "./storeUtils";

interface Props {
	product: MarketplaceProduct;
	model?: ModelStatus;
	owned: boolean;
	installed: boolean;
	/** Catalog `local_status` annotation (cached | not_downloaded) — reads the
	 *  same disk manifest the live `installed` signal does; used when present. */
	localStatus?: "cached" | "not_downloaded";
	isDownloading: boolean;
	downloadTask?: ActiveDownloadTask;
	onDetail: (p: MarketplaceProduct) => void;
	onQuickDownload?: (id: string) => void;
	onCancel?: (id: string) => void;
	onDelete?: (id: string) => void;
	busy?: boolean;
	wishlisted?: boolean;
	onToggleWishlist?: (id: string) => void;
}

export function StoreProductCard({
	product,
	model,
	owned,
	installed,
	localStatus,
	isDownloading,
	downloadTask,
	onDetail,
	onQuickDownload,
	onCancel,
	onDelete,
	busy,
	wishlisted,
	onToggleWishlist,
}: Props) {
	// Disk truth: the catalog annotation and/or the live model-status signal
	// (both read the same manifest — they never contradict each other).
	const cached = installed || localStatus === "cached";
	// Owned (licensed) but not on this device yet — one-step install.
	const ownedNotInstalled = owned && !cached;
	const description = getDisplayDescription(product, model);
	const chips = getCapabilityChips(model);
	const sizeLabel = model?.size_mb ? formatSize(model.size_mb) : null;
	const accent = CATEGORY_ACCENT[product.category] ?? CATEGORY_ACCENT.extras;

	return (
		<div
			className={cn(
				"panel group relative flex flex-col overflow-hidden transition-all card-hover",
				cached
					? "border-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
					: ownedNotInstalled
						? "border-sky-500/30 shadow-[0_0_0_1px_rgba(56,189,248,0.1)]"
						: "border-border hover:border-accent/20",
				isDownloading && "border-amber-500/30",
			)}
		>
			{/* subtle gradient header */}
			<div className={cn("h-1 w-full bg-gradient-to-r", accent)} />

			{/* biome-ignore lint/a11y/useSemanticElements: outer card must be div to allow nested wishlist button (valid HTML) */}
			<div
				role="button"
				tabIndex={0}
				onClick={() => onDetail(product)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onDetail(product);
					}
				}}
				className="flex flex-col gap-3 p-4 text-left flex-1 cursor-pointer"
			>
				<div className="flex items-start justify-between gap-2">
					<h3 className="font-semibold text-sm leading-tight text-foreground line-clamp-2 flex-1 min-w-0">
						{product.name}
					</h3>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggleWishlist?.(product.id);
						}}
						aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
						title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
						className="shrink-0 size-7 rounded-full border flex items-center justify-center transition-colors hover:bg-muted"
					>
						{wishlisted ? (
							<HeartSolid className="size-4 text-pink-500" />
						) : (
							<HeartIcon className="size-4 text-muted-foreground" />
						)}
					</button>
					{cached ? (
						<span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-text border border-emerald-500/25">
							<CheckBadgeIcon className="h-3 w-3" /> Installed
						</span>
					) : ownedNotInstalled ? (
						<span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info-text border border-sky-500/30">
							<KeyIcon className="h-3 w-3" /> Owned
						</span>
					) : product.paid ? (
						<span className="shrink-0 rounded-full bg-warning-soft px-3 py-0.5 text-xs font-bold text-warning-text border border-amber-500/25">
							${product.price_usd}
						</span>
					) : (
						<span className="shrink-0 rounded-full bg-success-soft px-3 py-0.5 text-xs font-semibold text-success-text border border-emerald-500/25">
							Free
						</span>
					)}
				</div>
				<p className="text-xs leading-relaxed text-muted-foreground line-clamp-3 min-h-[3.2em]">
					{description}
				</p>{" "}
				{product.special_offer && !cached && (
					<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-semibold text-fuchsia-300 border border-fuchsia-500/20">
						<SparklesIcon className="h-3 w-3" /> Special
					</span>
				)}
				{/* meta chips + rating */}
				<div className="flex flex-wrap items-center gap-2 mt-1">
					<span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize border border-border/60">
						{product.category}
					</span>
					{product.quality_score != null && (
						<StarRating score={product.quality_score} size="xs" />
					)}
					{sizeLabel && (
						<span className="text-xs text-muted-foreground/80">
							{sizeLabel}
						</span>
					)}
					{chips.map((c) => (
						<span
							key={c.label}
							className={cn(
								"rounded-full px-1.5 py-0.5 text-xs font-medium border",
								c.tone === "violet" &&
									"bg-accent/10 text-accent border-accent/20",
								c.tone === "amber" &&
									"bg-amber-500/10 text-amber-400 border-amber-500/20",
								c.tone === "cyan" &&
									"bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
								c.tone === "fuchsia" &&
									"bg-accent/10 text-accent border-accent/20",
								c.tone === "zinc" &&
									"bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
								c.tone === "blue" &&
									"bg-blue-500/10 text-blue-400 border-blue-500/20",
								c.tone === "teal" &&
									"bg-teal-500/10 text-teal-400 border-teal-500/20",
								c.tone === "red" &&
									"bg-red-500/10 text-red-400 border-red-500/20",
								c.tone === "emerald" &&
									"bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
							)}
						>
							{c.label}
						</span>
					))}
				</div>
				{isDownloading && downloadTask && (
					<div className="mt-2 space-y-1 w-full">
						<Progress value={downloadTask.progress ?? 0} className="h-1.5" />
						<div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
							<Spinner size="xs" />
							<span className="truncate">
								{downloadTask.filename ?? "Downloading…"}{" "}
								{downloadTask.progress
									? `· ${downloadTask.progress.toFixed(0)}%`
									: ""}
							</span>
						</div>
					</div>
				)}
			</div>

			{/* footer action bar — only place to buy/download/delete */}
			<div className="flex items-center gap-2 px-3 py-3 border-t bg-muted/20">
				{cached ? (
					<>
						<span className="text-xs font-medium text-emerald-600 dark:text-success-text flex-1">
							✓ Ready to use
						</span>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onDelete?.(product.id);
							}}
							title="Delete model — frees disk space"
							aria-label={`Delete ${product.name}`}
							className="inline-flex items-center justify-center size-7 rounded-md border border-border bg-card hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-muted-foreground transition-colors"
						>
							<TrashIcon className="size-3.5" />
						</button>
						<button
							type="button"
							onClick={() => onDetail(product)}
							className="text-xs font-medium text-muted-foreground hover:text-foreground px-2"
						>
							Manage
						</button>
					</>
				) : isDownloading ? (
					<>
						<span className="text-xs text-amber-600 dark:text-warning-text flex-1">
							Downloading…
						</span>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onCancel?.(product.id);
							}}
							title="Cancel download"
							aria-label="Cancel download"
							className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80"
						>
							<XMarkIcon className="size-3" /> Cancel
						</button>
					</>
				) : ownedNotInstalled ? (
					<>
						<button
							type="button"
							disabled={busy}
							onClick={(e) => {
								e.stopPropagation();
								if (onQuickDownload) {
									onQuickDownload(product.id);
								} else {
									onDetail(product);
								}
							}}
							title="You own this model — download it to use on this device"
							className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
						>
							{busy ? (
								<Spinner size="xs" className="text-white" />
							) : (
								<ArrowDownTrayIcon className="size-3.5" />
							)}
							{busy ? "Starting…" : "Install"}
						</button>
						<button
							type="button"
							onClick={() => onDetail(product)}
							className="text-xs text-muted-foreground hover:text-foreground px-1"
						>
							Details
						</button>
					</>
				) : product.paid && !owned ? (
					<>
						<button
							type="button"
							disabled={busy}
							onClick={() => onDetail(product)}
							className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
						>
							Buy ${product.price_usd}
						</button>
						<button
							type="button"
							onClick={() => onDetail(product)}
							className="text-xs text-muted-foreground hover:text-foreground px-1"
						>
							Details
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							disabled={busy}
							onClick={(e) => {
								e.stopPropagation();
								if (onQuickDownload) {
									onQuickDownload(product.id);
								} else {
									onDetail(product);
								}
							}}
							className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
						>
							{busy ? (
								<Spinner size="xs" className="text-white" />
							) : (
								<ArrowDownTrayIcon className="size-3.5" />
							)}
							{busy ? "Starting…" : "Download"}
						</button>
						<button
							type="button"
							onClick={() => onDetail(product)}
							className="text-xs text-muted-foreground hover:text-foreground px-1"
						>
							Details
						</button>
					</>
				)}
			</div>
		</div>
	);
}
