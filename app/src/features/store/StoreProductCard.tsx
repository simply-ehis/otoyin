import {
	ArrowDownTrayIcon,
	BoltIcon,
	CheckBadgeIcon,
	ExclamationTriangleIcon,
	HeartIcon,
	KeyIcon,
	SparklesIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolid } from "@heroicons/react/24/solid";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelCompatibilityInfo,
	ModelStatus,
} from "@/lib/api/types";
import { useRegionCurrency } from "@/lib/regionCurrency";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Spinner } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import { PresetVoiceAuditionList } from "@/features/voices/PresetVoiceAuditionList";
import {
	CATEGORY_ACCENT,
	CATEGORY_LABELS,
	formatPrice,
	formatSize,
	getCapabilityChips,
	getDisplayDescription,
} from "./storeUtils";

interface Props {
	product: MarketplaceProduct;
	model?: ModelStatus;
	compatibility?: ModelCompatibilityInfo;
	owned: boolean;
	installed: boolean;
	/** Catalog `local_status` annotation (cached | not_downloaded) — reads the
	 *  same disk manifest the live `installed` signal does; used when present. */
	localStatus?: "cached" | "not_downloaded";
	isDownloading: boolean;
	downloadTask?: ActiveDownloadTask;
	/** One-step Activate for cached models: loads the engine (apiClient.loadModel). */
	activating?: boolean;
	onActivate?: (id: string) => void;
	onDetail: (p: MarketplaceProduct) => void;
	onQuickDownload?: (id: string) => void;
	onCancel?: (id: string) => void;
	onDelete?: (id: string) => void;
	busy?: boolean;
	wishlisted?: boolean;
	onToggleWishlist?: (id: string) => void;
	/** Product arrived in a catalog newer than the last seen one — "New" badge. */
	isNew?: boolean;
}

/** Chip tones for the three per-product states + price/free. */
const chipClass = cn(
	"shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
);

export function StoreProductCard({
	product,
	model,
	compatibility,
	owned,
	installed,
	localStatus,
	isDownloading,
	downloadTask,
	activating,
	onActivate,
	onDetail,
	onQuickDownload,
	onCancel,
	onDelete,
	busy,
	wishlisted,
	onToggleWishlist,
	isNew,
}: Props) {
	// Disk truth: the catalog annotation and/or the live model-status signal
	// (both read the same manifest — they never contradict each other).
	const cached = installed || localStatus === "cached";
	// Display currency: browser locale → FX (USD fallback offline).
	const fx = useRegionCurrency();
	const priceLabel = formatPrice(product, fx);
	// Owned (licensed) but not on this device yet — one-step install.
	const ownedNotInstalled = owned && !cached;
	const description = getDisplayDescription(product, model);
	const chips = getCapabilityChips(model);
	const sizeLabel = model?.size_mb ? formatSize(model.size_mb) : null;
	const accent = CATEGORY_ACCENT[product.category] ?? CATEGORY_ACCENT.extras;

	return (
		<Card
			className={cn(
				"group relative flex flex-col overflow-hidden p-0",
				cached
					? "border-success/40"
					: ownedNotInstalled
						? "border-accent/40"
						: "border-border hover:border-accent/30",
				isDownloading && "border-warning/40",
			)}
		>
			<div className={cn("w-full border-t-[3px]", accent)} />

			{/* biome-ignore lint/a11y/useSemanticElements: outer card body must be a
			    div to allow the nested wishlist button (valid HTML, keyboard operable) */}
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
				className="flex flex-1 cursor-pointer flex-col gap-3 p-4 text-left"
			>
				{" "}
				<div className="flex items-start justify-between gap-2">
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						<h3 className="min-w-0 truncate text-sm font-semibold leading-tight text-foreground">
							{product.name}
						</h3>
						{isNew && (
							<span
								className="shrink-0 rounded-full border border-info/40 bg-info-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info-text"
								title={`Added since your last visit`}
							>
								New
							</span>
						)}
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={(e) => {
							e.stopPropagation();
							onToggleWishlist?.(product.id);
						}}
						aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
						title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
						className="shrink-0 rounded-full border border-border"
					>
						{wishlisted ? (
							<HeartSolid className="size-4 text-accent" />
						) : (
							<HeartIcon className="size-4 text-muted-foreground" />
						)}
					</Button>
					{cached ? (
						<span
							className={cn(
								chipClass,
								"bg-success-soft text-success-text border-success/40",
							)}
						>
							<CheckBadgeIcon className="size-3" /> Installed
						</span>
					) : ownedNotInstalled ? (
						<span
							className={cn(
								chipClass,
								"bg-info-soft text-info-text border-accent/30",
							)}
						>
							<KeyIcon className="size-3" /> Owned
						</span>
					) : product.paid ? (
						<span
							className={cn(
								chipClass,
								"bg-warning-soft text-warning-text border-warning/40",
							)}
						>
							{priceLabel}
						</span>
					) : (
						<span
							className={cn(
								chipClass,
								"bg-success-soft text-success-text border-success/40",
							)}
						>
							Free
						</span>
					)}
				</div>
				<p className="min-h-[3.2em] text-xs leading-relaxed text-muted-foreground line-clamp-3">
					{description}
				</p>
				{product.special_offer && !cached && (
					<span className="inline-flex w-fit items-center gap-1 rounded-full border border-accent/20 bg-secondary px-2 py-0.5 text-xs font-semibold text-accent">
						<SparklesIcon className="size-3" /> Special
					</span>
				)}
				{/* meta chips + rating */}
				<div className="mt-1 flex flex-wrap items-center gap-2">
					<span
						className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
						title={`Capability: ${CATEGORY_LABELS[product.category] ?? product.category}`}
					>
						{CATEGORY_LABELS[product.category] ?? product.category}
					</span>
					{sizeLabel && (
						<span className="text-xs text-muted-foreground">{sizeLabel}</span>
					)}
					{compatibility && !compatibility.compatible && !cached && (
						<span
							className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-text"
							title={compatibility.reason ?? "May not run on this device"}
						>
							<ExclamationTriangleIcon className="size-3" />
							{compatibility.reason ?? "Heavy for this device"}
						</span>
					)}
					{chips.map((c) => (
						<span
							key={c.label}
							className={cn(
								"rounded-full border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium",
								c.tone === "violet" && "text-accent border-accent/20",
								c.tone === "amber" && "text-warning border-warning/20",
								c.tone === "cyan" && "text-info border-info/20",
								c.tone === "fuchsia" && "text-accent border-accent/20",
								c.tone === "blue" && "text-info border-info/20",
								c.tone === "teal" && "text-info border-info/20",
								c.tone === "red" && "text-destructive border-destructive/20",
								c.tone === "emerald" && "text-success border-success/20",
								c.tone === "zinc" && "text-muted-foreground",
							)}
						>
							{c.label}
						</span>
					))}
				</div>
				{isDownloading && downloadTask && (
					<div className="mt-2 w-full space-y-1">
						<Progress value={downloadTask.progress ?? 0} className="h-1.5" />
						<div className="flex items-center gap-1 text-xs text-warning-text">
							<Spinner size="xs" />
							<span className="truncate">
								{downloadTask.progress
									? `${downloadTask.filename ?? "Downloading"} · ${downloadTask.progress.toFixed(0)}%`
									: "Preparing download…"}
							</span>
						</div>
					</div>
				)}
				{model?.engine && (model?.preset_voices?.length ?? 0) > 0 && (
					<div className="mt-2 w-full">
						<PresetVoiceAuditionList
							engine={model.engine}
							voices={model.preset_voices ?? []}
							downloaded={!!model.downloaded}
						/>
					</div>
				)}
			</div>

			{/* footer action bar — the only place to activate/buy/download/delete */}
			<div className="flex items-center gap-2 border-t border-border bg-secondary px-3 py-3">
				{cached ? (
					<>
						<Button
							size="sm"
							disabled={activating}
							onClick={(e) => {
								e.stopPropagation();
								onActivate?.(product.id);
							}}
							title="Load this engine now — one click, ready to generate"
							className="flex-1"
						>
							{activating ? (
								<Spinner size="xs" />
							) : (
								<BoltIcon className="size-3.5" />
							)}
							{activating ? "Activating…" : "Activate"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={(e) => {
								e.stopPropagation();
								onDelete?.(product.id);
							}}
							title="Delete model — frees disk space"
							aria-label={`Delete ${product.name}`}
							className="text-muted-foreground hover:text-destructive"
						>
							<TrashIcon className="size-3.5" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onDetail(product)}
							className="px-2"
						>
							Manage
						</Button>
					</>
				) : isDownloading ? (
					<>
						<span className="flex-1 text-xs text-warning-text">
							Downloading…
						</span>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={(e) => {
								e.stopPropagation();
								onCancel?.(product.id);
							}}
						>
							<XMarkIcon className="size-3" /> Cancel
						</Button>
					</>
				) : ownedNotInstalled ? (
					<>
						<Button
							size="sm"
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
							className="flex-1"
						>
							{busy ? (
								<Spinner size="xs" />
							) : (
								<ArrowDownTrayIcon className="size-3.5" />
							)}
							{busy ? "Starting…" : "Install"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onDetail(product)}
						>
							Details
						</Button>
					</>
				) : product.paid && !owned ? (
					<>
						<Button
							size="sm"
							disabled={busy}
							onClick={() => onDetail(product)}
							className="flex-1"
						>
							Buy {priceLabel}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onDetail(product)}
						>
							Details
						</Button>
					</>
				) : (
					<>
						<Button
							size="sm"
							disabled={busy}
							onClick={(e) => {
								e.stopPropagation();
								if (onQuickDownload) {
									onQuickDownload(product.id);
								} else {
									onDetail(product);
								}
							}}
							className="flex-1"
						>
							{busy ? (
								<Spinner size="xs" />
							) : (
								<ArrowDownTrayIcon className="size-3.5" />
							)}
							{busy ? "Starting…" : "Download"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onDetail(product)}
						>
							Details
						</Button>
					</>
				)}
			</div>
		</Card>
	);
}
