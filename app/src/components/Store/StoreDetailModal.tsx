import {
	ArrowDownTrayIcon,
	CheckBadgeIcon,
	KeyIcon,
	SparklesIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api/client";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import {
	getDeviceId,
	marketplaceClient,
	openExternalUrl,
} from "@/lib/marketplace";
import { cn } from "@/lib/utils/cn";
import { StarRating } from "./StarRating";
import {
	formatSize,
	getCapabilityChips,
	getDisplayDescription,
} from "./storeUtils";

function ExternalLinkIconComp({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.7}
			className={className}
			aria-hidden="true"
			role="img"
		>
			<title>External link</title>
			<path d="M13.5 6H19.5V12" />
			<path d="M19.5 6L10.5 15" />
			<path d="M9 9V19.5H19.5" />
		</svg>
	);
}

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
}: Props) {
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [licenseText, setLicenseText] = useState("");
	const [showLicense, setShowLicense] = useState(false);
	const [installing, setInstalling] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [checkingOut, setCheckingOut] = useState(false);

	useEffect(() => {
		if (open) {
			void queryClient.invalidateQueries({ queryKey: ["model-status"] });
			void queryClient.invalidateQueries({
				queryKey: ["marketplace", "entitlements"],
			});
		}
	}, [open, queryClient]);

	useEffect(() => {
		if (!open) {
			setShowLicense(false);
			setLicenseText("");
			setConfirmDelete(false);
		}
	}, [open]);

	// Description expand state
	const [descExpanded, setDescExpanded] = useState(false);
	const MAX_DESC_LENGTH = 300;

	// Fetch catalog for similar products
	const catalog = useQuery({
		queryKey: ["marketplace", "catalog"],
		queryFn: () => apiClient.getCatalog(),
		staleTime: 1000 * 60 * 10,
	});
	const products = catalog.data?.products ?? [];

	// Ratings — about + reviews from marketplace service
	const reviewsQ = useQuery({
		queryKey: ["marketplace", "reviews", product?.id],
		queryFn: () => marketplaceClient.fetchReviews(product?.id ?? ""),
		enabled: !!product && open,
		staleTime: 60_000,
	});

	// Tax preview for paid products
	const taxPreviewQ = useQuery({
		queryKey: ["marketplace", "tax", product?.id],
		queryFn: () =>
			marketplaceClient.previewTax(
				product?.price_usd ?? 0,
				"US", // Default; will be updated by region detection
				product?.id ?? "",
			),
		enabled: !!product && product.paid && open && !owned,
		staleTime: 5 * 60_000, // 5 min
	});
	const [rating, setRating] = useState(5);
	const [comment, setComment] = useState("");
	const [submittingReview, setSubmittingReview] = useState(false);

	// Find similar products (same category, excluding self).
	// Hooks must run unconditionally — this sits above the early return.
	const similarProducts = useMemo(() => {
		if (!product) {
			return [];
		}
		return products
			.filter((p) => p.category === product.category && p.id !== product.id)
			.sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
			.slice(0, 3);
	}, [product, products]);

	if (!product) {
		return null;
	}

	const description = getDisplayDescription(product, model);
	const chips = getCapabilityChips(model);
	// Disk truth: the catalog annotation and/or the live model-status signal
	// (both read the same manifest — they never contradict each other).
	const cached =
		installed ||
		product.local_status === "cached" ||
		localStatus === "cached";
	// Owned (licensed) but not on this device yet — one-step install.
	const ownedNotInstalled = owned && !cached;

	const handleDownload = async () => {
		setBusy(true);
		try {
			await onDownload(product.id);
		} catch (e) {
			showStudioErrorToast(e);
		} finally {
			setBusy(false);
		}
	};

	const handleRedeem = async () => {
		if (!licenseText.trim()) {
			return;
		}
		setInstalling(true);
		try {
			const parsed = JSON.parse(licenseText);
			await apiClient.installLicense(parsed);
			setShowLicense(false);
			setLicenseText("");
			await queryClient.invalidateQueries({
				queryKey: ["marketplace", "entitlements"],
			});
			await queryClient.invalidateQueries({ queryKey: ["model-status"] });
		} catch (err) {
			showStudioErrorToast(
				err instanceof SyntaxError
					? new Error("License is not valid JSON.")
					: err,
			);
		} finally {
			setInstalling(false);
		}
	};

	const handleDeleteConfirm = () => {
		onDelete(product.id);
		setConfirmDelete(false);
		onOpenChange(false);
	};

	// ── Checkout: open system browser → poll for license → auto-install ──
	const handleCheckout = async () => {
		if (!product) {
			return;
		}
		setCheckingOut(true);
		try {
			const deviceId = getDeviceId();
			const checkout = await marketplaceClient.createCheckout(
				product.id,
				deviceId,
				"",
			);
			// Open PayProGlobal checkout in system browser
			await openExternalUrl(checkout.checkout_url);
			// Poll for license (user completes payment in browser)
			const license = await marketplaceClient.pollForLicense(
				checkout.order_ref,
			);
			// Auto-install the license
			await marketplaceClient.installLicense(license);
			await queryClient.invalidateQueries({
				queryKey: ["marketplace", "entitlements"],
			});
			await queryClient.invalidateQueries({ queryKey: ["model-status"] });
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setCheckingOut(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col">
				<div className="relative px-6 pt-6 pb-4 border-b">
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-muted text-muted-foreground"
						title="Close"
						aria-label="Close"
					>
						<XMarkIcon className="size-4" />
					</button>
					<DialogHeader className="text-left pr-8">
						<DialogTitle className="text-xl leading-tight">
							{product.name}
						</DialogTitle>
						<p className="text-xs text-muted-foreground mt-1 line-clamp-2">
							{description}
						</p>
					</DialogHeader>
					<div className="flex flex-wrap items-center gap-2 mt-3">
						{product.paid ? (
							<span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning-text border border-amber-500/25">
								${product.price_usd}
							</span>
						) : (
							<span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success-text border border-emerald-500/25">
								Free
							</span>
						)}
						{product.special_offer && (
							<span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold text-fuchsia-300 border border-fuchsia-500/20">
								<SparklesIcon className="h-3.5 w-3.5" /> Special offer
							</span>
						)}
						<span className="text-xs text-muted-foreground capitalize px-2 py-1 rounded-full bg-muted/50 border">
							{product.category}
						</span>
						{model?.size_mb && (
							<span className="text-xs text-muted-foreground">
								{formatSize(model.size_mb)} on disk
							</span>
						)}
						{cached ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-success-soft border border-emerald-500/25 px-2.5 py-1 text-xs font-semibold text-success-text">
								<CheckBadgeIcon className="h-3.5 w-3.5" /> Installed · ready to use
							</span>
						) : ownedNotInstalled ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-info-soft border border-sky-500/30 px-2.5 py-1 text-xs font-semibold text-info-text">
								<KeyIcon className="h-3.5 w-3.5" /> Owned — install on this device
							</span>
						) : null}
					</div>
				</div>

				<div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
					{/* quick specs */}
					<div className="grid grid-cols-3 gap-2 text-xs">
						<div className="rounded-lg bg-muted/30 border px-3 py-2">
							<div className="text-xs uppercase tracking-wider text-muted-foreground">
								License
							</div>
							<div className="font-medium text-foreground mt-0.5">
								{product.paid ? "Paid · one-time" : "Free · Open"}
							</div>
						</div>
						<div className="rounded-lg bg-muted/30 border px-3 py-2">
							<div className="text-xs uppercase tracking-wider text-muted-foreground">
								Runs
							</div>
							<div className="font-medium text-foreground mt-0.5">
								Local · Offline
							</div>
						</div>
						<div className="rounded-lg bg-muted/30 border px-3 py-2">
							<div className="text-xs uppercase tracking-wider text-muted-foreground">
								Quality
							</div>
							<div className="font-medium text-foreground mt-0.5">
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
							{model.engine && (
								<Badge variant="outline" className="text-xs">
									{model.engine}
								</Badge>
							)}
							{model.category && (
								<Badge variant="outline" className="text-xs capitalize">
									{model.category}
								</Badge>
							)}
							{chips.map((c) => (
								<Badge
									key={c.label}
									variant="outline"
									className={cn(
										"text-xs",
										c.tone === "violet" &&
											"border-violet-500/30 text-violet-400",
										c.tone === "amber" && "border-amber-500/30 text-amber-400",
									)}
								>
									{c.label}
								</Badge>
							))}
						</div>
					)}

					{model?.hf_repo_id && (
						<a
							href={`https://huggingface.co/${model.hf_repo_id}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
						>
							{model.hf_repo_id} <ExternalLinkIconComp className="size-3" />
						</a>
					)}

					{/* download progress */}
					{isDownloading && downloadTask && (
						<div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3 space-y-2">
							<div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
								<Spinner size="xs" /> Downloading{" "}
								{downloadTask.filename ?? product.name}…
							</div>
							<Progress value={downloadTask.progress ?? 0} className="h-1.5" />
							<div className="text-xs text-muted-foreground">
								{downloadTask.current && downloadTask.total
									? `${(downloadTask.current / 1024 / 1024).toFixed(1)} / ${(downloadTask.total / 1024 / 1024).toFixed(1)} MB · ${(downloadTask.progress ?? 0).toFixed(0)}%`
									: (downloadTask.filename ?? "Connecting…")}
							</div>
						</div>
					)}

					{/* actions — single place to buy/download/delete */}
					<div className="pt-2 border-t space-y-3">
						{cached ? (
							<div className="space-y-2">
								<div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
									<CheckBadgeIcon className="h-4 w-4" />
									Installed and ready — use it in Generate, Stories, or Audio
									Studio.
								</div>
								{!confirmDelete ? (
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setConfirmDelete(true)}
											className="text-destructive border-destructive/30 hover:bg-destructive/10"
										>
											<TrashIcon className="size-3.5 mr-1.5" /> Delete model
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => onOpenChange(false)}
										>
											Done
										</Button>
									</div>
								) : (
									<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
										<p className="text-xs font-medium">
											Delete {product.name}? This frees{" "}
											{model?.size_mb
												? formatSize(model.size_mb)
												: "disk space"}{" "}
											and requires re-download to use again. This is the only
											place to delete it.
										</p>
										<div className="flex gap-2">
											<Button
												size="sm"
												variant="destructive"
												onClick={handleDeleteConfirm}
											>
												<TrashIcon className="size-3.5 mr-1" />
												Confirm delete
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setConfirmDelete(false)}
											>
												Cancel
											</Button>
										</div>
									</div>
								)}
							</div>
						) : showLicense ? (
							<div className="space-y-2">
								<p className="text-xs text-muted-foreground">
									Paste the license JSON you received after purchase. This
									marketplace is the only place to redeem it.
								</p>
								<textarea
									value={licenseText}
									onChange={(e) => setLicenseText(e.target.value)}
									rows={3}
									placeholder='{"license_key":"…","signature":"…"}'
									className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent"
								/>
								<div className="flex gap-2">
									<Button
										size="sm"
										disabled={installing || !licenseText.trim()}
										onClick={handleRedeem}
									>
										{installing ? (
											<Spinner size="xs" className="mr-1.5" />
										) : (
											<KeyIcon className="mr-1.5 size-3.5" />
										)}
										{installing ? "Installing…" : "Install License"}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setShowLicense(false)}
									>
										Back
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									Need a license? Buy below — you'll get a JSON file to paste
									here.
								</p>
							</div>
						) : isDownloading ? (
							<div className="flex gap-2">
								<Button size="sm" variant="outline" disabled className="flex-1">
									<Spinner size="xs" className="mr-1.5" />
									Downloading…
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => onCancel(product.id)}
								>
									Cancel
								</Button>
							</div>
						) : product.paid && !owned ? (
							<div className="space-y-2">
								<div className="flex gap-2">
									<Button
										size="sm"
										onClick={() => setShowLicense(true)}
										className="bg-amber-500 hover:bg-amber-600 text-white flex-1"
									>
										<KeyIcon className="mr-1.5 size-3.5" />I have a license —
										Redeem
									</Button>
								</div>
								<div className="space-y-1">
									<p className="text-xs text-muted-foreground">
										One-time purchase · Runs offline forever · License is
										checked locally, no internet required.
									</p>
									{taxPreviewQ.data && taxPreviewQ.data.tax_amount > 0 && (
										<p className="text-xs text-muted-foreground">
											+ {taxPreviewQ.data.tax_name} ({taxPreviewQ.data.tax_rate}
											%) = ${taxPreviewQ.data.total.toFixed(2)} total
										</p>
									)}
								</div>
								<Button
									size="sm"
									className="w-full bg-amber-500 hover:bg-amber-600 text-white"
									onClick={handleCheckout}
									disabled={checkingOut}
								>
									{checkingOut ? (
										<>
											<Spinner size="xs" className="mr-1.5" />
											Processing…
										</>
									) : (
										`Buy $${product.price_usd} — Get license`
									)}
								</Button>
							</div>
						) : (
							<div className="space-y-2">
								{ownedNotInstalled && (
									<p className="text-xs text-sky-600 dark:text-info-text">
										You own this model — your license is verified locally.
										Download it once to use it on this device.
									</p>
								)}
								<div className="flex gap-2">
									<Button
										size="sm"
										disabled={busy}
										onClick={handleDownload}
										className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
									>
										{busy ? (
											<Spinner size="xs" className="mr-1.5" />
										) : (
											<ArrowDownTrayIcon className="mr-1.5 size-3.5" />
										)}
										{busy
											? "Starting…"
											: ownedNotInstalled
												? "Install"
												: "Download"}
										{model?.size_mb ? ` · ${formatSize(model.size_mb)}` : ""}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => onOpenChange(false)}
									>
										Close
									</Button>
								</div>
							</div>
						)}
					</div>

					{/* ── Divider ── */}
					<div className="my-4 border-t border-border/40" />
					{/* why buy callout */}
					{product.paid && !owned && !cached && (
						<div className="rounded-lg bg-card border border-border p-3">
							<div className="text-xs font-semibold text-foreground">
								Why makers buy this
							</div>
							<ul className="mt-1.5 space-y-1 text-xs text-muted-foreground list-disc pl-4">
								<li>Offline & private — your voice never leaves the device.</li>
								<li>One-time fee, no subscription, no cloud.</li>
								<li>
									Installed from this marketplace only — secure signed catalog.
								</li>
							</ul>
						</div>
					)}

					{/* ── Divider ── */}
					<div className="my-4 border-t border-border/40" />
					{/* Ratings — about from marketplace long_description + user reviews */}
					<div className="rounded-lg border bg-muted/20 p-3 space-y-2">
						<div className="flex items-center gap-2">
							{product &&
							(product as unknown as { avg_rating?: number }).avg_rating ? (
								<>
									<StarRating
										score={
											((product as unknown as { avg_rating: number })
												.avg_rating /
												5) *
											10
										}
										size="sm"
									/>
									<span className="text-xs font-medium text-foreground">
										{(
											product as unknown as { avg_rating: number }
										).avg_rating.toFixed(1)}{" "}
										·{" "}
										{
											(product as unknown as { review_count: number })
												.review_count
										}{" "}
										reviews
									</span>
								</>
							) : (
								<>
									<StarRating score={product.quality_score ?? 0} size="sm" />
									<span className="text-xs text-muted-foreground">
										Quality {product.quality_score ?? 0}/10 · No reviews yet
									</span>
								</>
							)}
						</div>
						{product &&
							(product as unknown as { long_description?: string })
								.long_description && (
								<div className="space-y-2 pt-2 border-t">
									{(product as unknown as { long_description: string })
										.long_description.length > MAX_DESC_LENGTH &&
									!descExpanded ? (
										<>
											<p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
												{
													(product as unknown as { long_description: string })
														.long_description
												}
											</p>
											<button
												type="button"
												onClick={() => setDescExpanded(true)}
												className="text-xs font-medium text-accent hover:underline mt-1"
											>
												Read more
											</button>
										</>
									) : (
										<p className="text-xs text-muted-foreground leading-relaxed">
											{
												(product as unknown as { long_description: string })
													.long_description
											}
										</p>
									)}
									{!descExpanded &&
										(product as unknown as { long_description: string })
											.long_description.length > MAX_DESC_LENGTH && (
											<button
												type="button"
												onClick={() => setDescExpanded(false)}
												className="text-xs font-medium text-accent hover:underline mt-1"
											>
												Show less
											</button>
										)}
								</div>
							)}
						{/* ── Divider ── */}
						<div className="my-4 border-t border-border/40" />
						{product &&
							(product as unknown as { languages?: string[] }).languages &&
							(product as unknown as { languages: string[] }).languages.length >
								0 && (
								<div className="space-y-2">
									<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Languages
									</h4>
									<div className="flex flex-wrap gap-1">
										{(product as unknown as { languages: string[] }).languages
											.slice(0, 8)
											.map((l) => (
												<span
													key={l}
													className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
												>
													{l}
												</span>
											))}
									</div>
								</div>
							)}
						{/* ── Divider ── */}
						<div className="my-4 border-t border-border/40" />
						{product && (product as unknown as { size_mb?: number }).size_mb ? (
							<div className="space-y-1">
								<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Size & License
								</h4>
								<span className="text-xs text-muted-foreground">
									{formatSize(
										(product as unknown as { size_mb: number }).size_mb,
									)}{" "}
									·{" "}
									{(product as unknown as { license?: string }).license ||
										"commercial"}
								</span>
							</div>
						) : null}
						{/* ── Divider ── */}
						<div className="my-4 border-t border-border/40" />
						{reviewsQ.data && reviewsQ.data.length > 0 && (
							<div className="space-y-2">
								<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Reviews
								</h4>
								<div className="space-y-1.5 pt-2 border-t border-border/40">
									{reviewsQ.data.slice(0, 3).map((r) => (
										<div
											key={r.id}
											className="text-xs border-b border-border/40 pb-1 last:border-0"
										>
											<span className="font-medium">
												{"★".repeat(r.rating)}
												{"☆".repeat(5 - r.rating)}
											</span>{" "}
											<span className="text-muted-foreground">
												{r.comment || "—"}
											</span>
										</div>
									))}
								</div>
							</div>
						)}
						<div className="flex gap-2 pt-2">
							<select
								value={rating}
								onChange={(e) => setRating(Number(e.target.value))}
								className="rounded-md border bg-background px-2 py-1 text-xs"
							>
								{[5, 4, 3, 2, 1].map((n) => (
									<option key={n} value={n}>
										{n}★
									</option>
								))}
							</select>
							<input
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								placeholder="Write a review…"
								className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
								maxLength={200}
							/>
							<Button
								size="sm"
								disabled={submittingReview}
								onClick={async () => {
									if (!product) {
										return;
									}
									setSubmittingReview(true);
									try {
										await marketplaceClient.postReview(
											product.id,
											rating,
											comment,
											getDeviceId(),
										);
										setComment("");
										await reviewsQ.refetch();
										await catalog.refetch();
									} catch (e) {
										showStudioErrorToast(e);
									} finally {
										setSubmittingReview(false);
									}
								}}
							>
								{submittingReview ? "…" : "Post"}
							</Button>
						</div>
					</div>

					{/* ── Divider ── */}
					<div className="my-4 border-t border-border/40" />
					{/* similar products */}
					{similarProducts.length > 0 && (
						<div className="space-y-2">
							<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								Also in {product.category}
							</h4>
							<div className="space-y-1.5">
								{similarProducts.map((sp) => (
									<button
										key={sp.id}
										type="button"
										className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
										onClick={() => {
											onProductChange?.(sp);
										}}
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-xs font-medium text-foreground truncate">
													{sp.name}
												</span>
												{sp.paid ? (
													<span className="text-xs font-semibold text-amber-400">
														${sp.price_usd}
													</span>
												) : (
													<span className="text-xs font-medium text-emerald-400">
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
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
});
