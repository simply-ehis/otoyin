import {
	ArrowPathIcon,
	ExclamationTriangleIcon,
	FolderOpenIcon,
	HeartIcon,
	KeyIcon,
	MagnifyingGlassIcon,
	QuestionMarkCircleIcon,
	ShoppingBagIcon,
	SparklesIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	buildDownloadProgressMap,
	buildErroredDownloads,
} from "@/components/ServerSettings/useModelSections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { LicenseRecord, MarketplaceProduct } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { getDeviceId, marketplaceClient } from "@/lib/marketplace";
import { cn } from "@/lib/utils/cn";
import { usePlatform } from "@/platform/PlatformContext";
import { PerEngineKeepaliveRow } from "./PerEngineKeepaliveRow";
import { PricingAdmin } from "./PricingAdmin";
import { StoreDetailModal } from "./StoreDetailModal";
import { StoreProductCard } from "./StoreProductCard";
import {
	buildFilteredProducts,
	CATEGORIES,
	CATEGORY_LABELS,
	type CategoryId,
	getProductModelStatus,
	type SortMode,
	USE_CASES,
} from "./storeUtils";

type ShowFilter = "all" | "installed" | "available" | "paid" | "free";

export function StorePage() {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const platform = usePlatform();

	const [search, setSearch] = useState("");
	const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
	const [activeUseCase, setActiveUseCase] = useState<string>("all");
	const [showFilter, setShowFilter] = useState<ShowFilter>("all");
	const [sortMode, setSortMode] = useState<SortMode>("default");
	const [detailProduct, setDetailProduct] = useState<MarketplaceProduct | null>(
		null,
	);
	const [pendingDownload, setPendingDownload] = useState<string | null>(null);
	const [storeView, setStoreView] = useState<"browse" | "licenses" | "pricing">(
		"browse",
	);
	const [showWishlistOnly, setShowWishlistOnly] = useState(false);
	const [wishlist, setWishlist] = useState<Set<string>>(() => {
		try {
			const raw = localStorage.getItem("otoyin-wishlist");
			return new Set(raw ? (JSON.parse(raw) as string[]) : []);
		} catch {
			return new Set();
		}
	});

	// -- Queries (single source � this page is the ONLY place to buy/download/delete) --
	// Fetch catalog from remote marketplace server, fall back to bundled catalog with offline badge
	const catalog = useQuery({
		queryKey: ["marketplace", "catalog"],
		queryFn: () => marketplaceClient.fetchCatalog(),
		staleTime: 1000 * 60 * 10,
		retry: 1,
	});
	const isOfflineCatalog = catalog.isError;
	const entitlements = useQuery({
		queryKey: ["marketplace", "entitlements"],
		queryFn: () => apiClient.getEntitlements(),
		staleTime: 1000 * 60 * 5,
	});
	const modelsStatus = useQuery({
		queryKey: ["model-status"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 1000 * 30,
		refetchInterval: 30_000,
	});
	// Annotated local catalog — signed + verified + per-product `local_status`.
	// The listing itself stays on the remote catalog; this only feeds install
	// state into the cards when the remote product carries no annotation.
	const localStatusQ = useQuery({
		queryKey: ["marketplace", "catalog", "local-status"],
		queryFn: () => apiClient.getCatalog(),
		staleTime: 1000 * 60 * 10,
		retry: 1,
	});
	const activeTasksQ = useQuery({
		queryKey: ["activeTasks"],
		queryFn: () => apiClient.getActiveTasks(),
		refetchInterval: (q) =>
			q.state.data?.downloads.some((d) => d.status === "downloading")
				? 2000
				: 8000,
	});
	const cacheDirQ = useQuery({
		queryKey: ["modelsCacheDir"],
		queryFn: () => apiClient.getModelsCacheDir(),
		staleTime: 1000 * 60 * 5,
	});
	const licensesQ = useQuery({
		queryKey: ["marketplace", "licenses"],
		queryFn: () => apiClient.getLicenses(),
		staleTime: 1000 * 60 * 5,
	});
	const offersQ = useQuery({
		queryKey: ["marketplace", "offers"],
		queryFn: () => apiClient.getMarketplaceOffers(),
		staleTime: 1000 * 60 * 5,
	});
	// Wishlist � local + sync to marketplace service
	const wishlistQ = useQuery({
		queryKey: ["marketplace", "wishlist"],
		queryFn: async () => {
			try {
				const { getDeviceId, marketplaceClient } = await import(
					"@/lib/marketplace"
				);
				const deviceId = getDeviceId();
				return await marketplaceClient.fetchWishlist(deviceId);
			} catch {
				return { product_ids: [] as string[] };
			}
		},
		staleTime: 60_000,
	});
	useEffect(() => {
		if (wishlistQ.data?.product_ids) {
			setWishlist(new Set(wishlistQ.data.product_ids));
		}
	}, [wishlistQ.data]);
	useEffect(() => {
		try {
			localStorage.setItem("otoyin-wishlist", JSON.stringify([...wishlist]));
		} catch {}
	}, [wishlist]);

	const owned = useMemo(() => {
		const s = new Set<string>();
		for (const e of entitlements.data?.entitlements ?? []) {
			if (e.startsWith("models:")) {
				s.add(e.slice(7));
			}
		}
		return s;
	}, [entitlements.data]);
	const installed = useMemo(
		() =>
			new Set(
				(modelsStatus.data?.models ?? [])
					.filter((m) => m.downloaded)
					.map((m) => m.model_name),
			),
		[modelsStatus.data],
	);
	const localStatusById = useMemo(() => {
		const m = new Map<string, "cached" | "not_downloaded">();
		for (const p of localStatusQ.data?.products ?? []) {
			if (p.local_status) {
				m.set(p.id, p.local_status);
			}
		}
		return m;
	}, [localStatusQ.data]);
	const downloadProgressMap = useMemo(
		() => buildDownloadProgressMap(activeTasksQ.data),
		[activeTasksQ.data],
	);
	const errored = useMemo(
		() => buildErroredDownloads(activeTasksQ.data, new Set(), new Map()),
		[activeTasksQ.data],
	);

	const products = catalog.data?.products ?? [];
	const models = modelsStatus.data?.models;

	const filtered = useMemo(
		() =>
			buildFilteredProducts(
				products,
				models,
				activeCategory,
				search,
				showFilter,
				owned,
				installed,
				sortMode,
				activeUseCase,
				wishlist,
				showWishlistOnly,
			),
		[
			products,
			models,
			activeCategory,
			search,
			showFilter,
			owned,
			installed,
			sortMode,
			activeUseCase,
			wishlist,
			showWishlistOnly,
		],
	);

	const groups = useMemo(() => {
		if (
			activeCategory !== "all" ||
			activeUseCase !== "all" ||
			search.trim() ||
			showFilter !== "all" ||
			showWishlistOnly
		) {
			return [["", filtered] as const];
		}
		const map = new Map<string, MarketplaceProduct[]>();
		for (const p of filtered) {
			const arr = map.get(p.category) ?? [];
			arr.push(p);
			map.set(p.category, arr);
		}
		return Array.from(map.entries());
	}, [
		filtered,
		activeCategory,
		activeUseCase,
		search,
		showFilter,
		showWishlistOnly,
	]);

	const freeCount = products.filter((p) => !p.paid).length;
	const paidCount = products.filter((p) => p.paid).length;
	const installedCount = installed.size;
	const [translationExpanded, setTranslationExpanded] = useState(false);

	// -- Mutations (only here) --
	const downloadMut = useMutation({
		mutationFn: (id: string) => apiClient.triggerModelDownload(id),
		onMutate: (id) => setPendingDownload(id),
		onSuccess: async (_data, _id) => {
			await queryClient.invalidateQueries({ queryKey: ["model-status"] });
			await queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
			const prevModels = queryClient.getQueryData<{
				models: Array<{ downloaded: boolean; category: string }>;
			}>(["model-status"]);
			const hadTts =
				prevModels?.models?.some((m) => m.category === "tts" && m.downloaded) ??
				false;
			if (!hadTts) {
				toast({
					title: "Voice engine installed",
					description: "Now create a voice profile and try generating speech.",
				});
			}
		},
		onError: (err) => showStudioErrorToast(err),
		onSettled: () => setPendingDownload(null),
	});
	const cancelMut = useMutation({
		mutationFn: (id: string) => apiClient.cancelDownload(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
			await queryClient.invalidateQueries({ queryKey: ["model-status"] });
		},
		onError: (e) => showStudioErrorToast(e),
	});
	const deleteMut = useMutation({
		mutationFn: (id: string) => apiClient.deleteModel(id),
		onSuccess: async (_data, id) => {
			toast({
				title: "Model deleted",
				description: `${id} removed. Re-download anytime from this marketplace.`,
			});
			await queryClient.invalidateQueries({ queryKey: ["model-status"] });
			await queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
		},
		onError: (e) => showStudioErrorToast(e),
	});

	const detailModel = detailProduct
		? getProductModelStatus(detailProduct.id, models)
		: undefined;
	const detailTask = detailProduct
		? downloadProgressMap.get(detailProduct.id)
		: undefined;
	const isDetailDownloading = !!detailTask;

	return (
		<div className="flex flex-col h-full min-h-0 overflow-y-auto">
			<div className="mx-auto max-w-6xl w-full py-6 px-4 space-y-5">
				{/* Hero � warm, Caravaggio-inspired, rose is the only motion */}
				<header className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-accent/10 via-card to-card p-5">
					<div
						className="absolute -right-20 -top-20 size-64 rounded-full bg-accent/10 blur-3xl pointer-events-none"
						aria-hidden
					/>
					<div className="relative flex flex-wrap items-start justify-between gap-4">
						<div className="flex gap-3">
							<div className="flex items-center justify-center size-11 rounded-xl bg-accent/15 border border-accent/20 shrink-0">
								<ShoppingBagIcon className="size-6 text-accent" />
							</div>
							<div>
								<h1 className="text-2xl font-bold tracking-tight text-foreground">
									Marketplace
								</h1>
								<p className="text-sm text-muted-foreground mt-1 max-w-xl">
									The{" "}
									<span className="font-medium text-foreground">
										only place
									</span>{" "}
									to buy, download, and remove models. Everything runs locally,
									offline � no cloud, one-time purchases.
								</p>
								<p className="text-xs text-muted-foreground/80 mt-1">
									{products.length} models � {freeCount} free � {paidCount}{" "}
									premium � {installedCount} installed on this device
									{isOfflineCatalog && (
										<span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/20">
											Offline � bundled catalog
										</span>
									)}
								</p>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setShowFilter(
										showFilter === "installed" ? "all" : "installed",
									)
								}
								className={cn(
									showFilter === "installed" &&
										"bg-accent text-accent-foreground border-accent",
								)}
							>
								? Installed ({installedCount})
							</Button>
							<Button
								variant={showWishlistOnly ? "default" : "outline"}
								size="sm"
								onClick={() => setShowWishlistOnly(!showWishlistOnly)}
								className={
									showWishlistOnly
										? "bg-pink-500 text-white border-pink-500"
										: ""
								}
								title="Show wishlist only"
								aria-label="Toggle wishlist"
							>
								<HeartIcon
									className={
										showWishlistOnly ? "size-4 fill-current" : "size-4"
									}
								/>{" "}
								Wishlist ({wishlist.size})
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									queryClient.invalidateQueries({ queryKey: ["model-status"] })
								}
								title="Refresh install state"
								aria-label="Refresh"
							>
								<ArrowPathIcon className="size-4" />
							</Button>
						</div>
					</div>
					{cacheDirQ.data?.path && (
						<div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground border-t pt-3">
							<FolderOpenIcon className="size-3.5 shrink-0" />
							<span
								className="font-mono truncate max-w-[28rem]"
								title={cacheDirQ.data.path}
							>
								{cacheDirQ.data.path}
							</span>
							{platform.metadata.isTauri && (
								<button
									type="button"
									onClick={async () => {
										try {
											await platform.filesystem.openPath(cacheDirQ.data.path);
										} catch {
											toast({
												title: "Could not open folder",
												variant: "destructive",
											});
										}
									}}
									className="underline hover:text-foreground"
								>
									Open
								</button>
							)}
							<span className="text-muted-foreground/60">
								� Manage downloads and deletes here � no other page offers it.
							</span>
						</div>
					)}
				</header>

				{/* Tab switcher */}
				<div className="flex items-center gap-1 border-b border-border pb-2">
					{(["browse", "licenses", "pricing"] as const).map((tab) => (
						<button
							key={tab}
							type="button"
							className={cn(
								"text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
								storeView === tab
									? "bg-accent/10 text-accent"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setStoreView(tab)}
						>
							{tab === "browse"
								? "Browse Models"
								: tab === "licenses"
									? `My Licenses${licensesQ.data?.licenses?.length ? ` (${licensesQ.data.licenses.length})` : ""}`
									: "Pricing Admin"}
						</button>
					))}
				</div>

				{/* Special offers banner */}
				{offersQ.data && offersQ.data.length > 0 && (
					<div className="grid gap-2 sm:grid-cols-2">
						{offersQ.data.map((offer) => (
							<button
								key={offer.id}
								type="button"
								onClick={() => setDetailProduct(offer)}
								className="flex items-center gap-3 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10 px-4 py-3 text-left hover:bg-fuchsia-500/15 transition-colors"
							>
								<SparklesIcon className="size-5 shrink-0 text-fuchsia-400" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-foreground truncate">
											{offer.name}
										</span>
										<span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-bold text-fuchsia-300">
											Special
										</span>
									</div>
									<div className="text-xs text-muted-foreground truncate">
										Limited-time ${offer.price_usd}
										{offer.baseline_usd
											? ` � was $${offer.baseline_usd} (${offer.discount_pct}% off)`
											: ""}
										{" � "}
										{offer.note}
									</div>
								</div>
							</button>
						))}
					</div>
				)}

				{storeView === "pricing" ? (
					/* -- Pricing Admin view -------------------------------- */
					<PricingAdmin />
				) : storeView === "licenses" ? (
					/* -- Licenses view -------------------------------------- */
					<div className="space-y-4">
						{licensesQ.isLoading ? (
							<div className="flex items-center justify-center py-16">
								<Skeleton className="h-8 w-48" />
							</div>
						) : licensesQ.data?.licenses?.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 border rounded-xl bg-card">
								<KeyIcon className="size-10 text-muted-foreground/20 mb-2" />
								<p className="text-sm text-muted-foreground">
									No licenses installed yet
								</p>
								<p className="text-xs text-muted-foreground/60 mt-1">
									Buy a premium model to get a license, or paste a license JSON
									below.
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{(licensesQ.data?.licenses ?? []).map((lic: LicenseRecord) => (
									<div
										key={lic.product_id}
										className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-foreground truncate">
													{lic.name}
												</span>
												<Badge variant="outline" className="text-xs">
													{lic.type}
												</Badge>
												<span
													className={cn(
														"text-xs font-semibold",
														lic.status === "active"
															? "text-emerald-500"
															: "text-amber-500",
													)}
												>
													{lic.status}
												</span>
											</div>
											{lic.expires_at && (
												<span className="text-xs text-muted-foreground">
													Expires{" "}
													{new Date(lic.expires_at).toLocaleDateString()}
												</span>
											)}
										</div>
									</div>
								))}
							</div>
						)}
						{entitlements.data?.entitlements &&
							entitlements.data.entitlements.length > 0 && (
								<div className="mt-4">
									<h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
										Active Entitlements
									</h3>
									<div className="flex flex-wrap gap-2">
										{entitlements.data.entitlements.map((ent: string) => (
											<Badge key={ent} variant="secondary" className="text-xs">
												{ent}
											</Badge>
										))}
									</div>
								</div>
							)}
					</div>
				) : (
					/* -- Browse view (original) ---------------------------- */
					<>
						{/* Search + category + paid/free filter */}
						<div className="space-y-3">
							<div className="flex gap-2">
								<div className="relative flex-1">
									<MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
									<Input
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder="Search voices, languages, quality, use-cases�"
										className="pl-9 h-9 text-sm"
									/>
									{search && (
										<button
											type="button"
											onClick={() => setSearch("")}
											className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
											title="Clear search"
											aria-label="Clear search"
										>
											<XMarkIcon className="size-3.5" />
										</button>
									)}
								</div>
								<div className="hidden sm:flex gap-2">
									{(["all", "free", "paid"] as const).map((f) => (
										<button
											key={f}
											type="button"
											onClick={() => setShowFilter(f)}
											className={cn(
												"rounded-md px-3 py-1.5 text-xs font-medium border transition-colors",
												showFilter === f
													? "bg-accent text-accent-foreground border-accent"
													: "bg-card text-muted-foreground border-border hover:bg-muted/50",
											)}
										>
											{f === "all" ? "All" : f === "free" ? "Free" : "Paid"}
										</button>
									))}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<select
									value={sortMode}
									onChange={(e) => setSortMode(e.target.value as SortMode)}
									className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
									aria-label="Sort models"
								>
									<option value="default">Default</option>
									<option value="quality">Best Quality</option>
									<option value="price-asc">Price: Low to High</option>
									<option value="price-desc">Price: High to Low</option>
									<option value="name">Name A-Z</option>
								</select>
							</div>
							<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
								{CATEGORIES.map((cat) => {
									const Icon = cat.icon;
									const count =
										cat.id === "all"
											? products.length
											: products.filter((p) => p.category === cat.id).length;
									return (
										<button
											key={cat.id}
											type="button"
											onClick={() => setActiveCategory(cat.id)}
											className={cn(
												"flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap border transition-colors",
												activeCategory === cat.id
													? "bg-foreground text-background border-foreground"
													: "bg-card text-muted-foreground border-border hover:bg-muted/50",
											)}
										>
											<Icon className="size-3.5" />
											{cat.label}
											{count > 0 && (
												<span className="text-xs opacity-60">� {count}</span>
											)}
										</button>
									);
								})}
							</div>
							{/* Use-case filter � separation by use case */}
							<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
								{USE_CASES.map((uc) => (
									<button
										key={uc.id}
										type="button"
										onClick={() => setActiveUseCase(uc.id)}
										className={cn(
											"rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap border transition-colors",
											activeUseCase === uc.id
												? "bg-accent text-accent-foreground border-accent"
												: "bg-card text-muted-foreground border-border hover:bg-muted/50",
										)}
									>
										{uc.label}
									</button>
								))}
							</div>
							<div className="flex sm:hidden gap-2">
								{(["all", "free", "paid"] as const).map((f) => (
									<button
										key={f}
										type="button"
										onClick={() => setShowFilter(f)}
										className={cn(
											"flex-1 rounded-md px-3 py-1.5 text-xs font-medium border",
											showFilter === f
												? "bg-accent text-accent-foreground border-accent"
												: "bg-card text-muted-foreground border-border",
										)}
									>
										{f}
									</button>
								))}
							</div>
						</div>

						<PerEngineKeepaliveRow models={models} />

						{/* Problems banner (if any) */}
						{errored.size > 0 && (
							<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 flex items-start gap-2">
								<ExclamationTriangleIcon className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
								<div className="flex-1 min-w-0">
									<div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
										{errored.size} download{errored.size > 1 ? "s" : ""} failed
									</div>
									<div className="text-xs text-muted-foreground truncate">
										{Array.from(errored.keys()).join(", ")}
									</div>
								</div>
								<Button
									size="sm"
									variant="ghost"
									className="h-7 text-xs"
									onClick={async () => {
										await apiClient.clearAllTasks();
										await queryClient.invalidateQueries({
											queryKey: ["activeTasks"],
										});
									}}
								>
									Clear
								</Button>
							</div>
						)}

						{/* Loading skeletons */}
						{(catalog.isLoading || modelsStatus.isLoading) && (
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
								{Array.from({ length: 6 }, (_, i) => i).map((i) => (
									<div
										key={`sk-${i}`}
										className="rounded-xl border bg-card p-4 space-y-3"
									>
										<div className="flex justify-between">
											<Skeleton className="h-4 w-2/3" />
											<Skeleton className="h-5 w-16 rounded-full" />
										</div>
										<Skeleton className="h-3 w-full" />
										<Skeleton className="h-3 w-5/6" />
										<div className="flex gap-2">
											<Skeleton className="h-5 w-12 rounded-full" />
											<Skeleton className="h-5 w-12 rounded-full" />
										</div>
										<Skeleton className="h-8 w-full rounded-md" />
									</div>
								))}
							</div>
						)}

						{/* Offline � marketplace service unreachable, no bundled fallback */}
						{catalog.isError && !catalog.isLoading && (
							<div className="flex flex-col items-center justify-center gap-3 py-16 text-center border rounded-xl bg-card border-amber-500/20">
								<ExclamationTriangleIcon className="size-10 text-amber-500/40" />
								<p className="text-sm font-medium text-foreground">
									Marketplace offline
								</p>
								<p className="text-xs text-muted-foreground max-w-md">
									Could not reach the marketplace service at
									marketplace.21labs.app. The catalog is served by the separate
									marketplace backend � no bundled registry. Check your
									connection or try again.
								</p>
								<Button
									size="sm"
									variant="outline"
									onClick={() => catalog.refetch()}
								>
									<ArrowPathIcon className="size-4 mr-1.5" /> Retry
								</Button>
							</div>
						)}

						{/* Empty */}
						{!catalog.isError &&
							!catalog.isLoading &&
							!modelsStatus.isLoading &&
							filtered.length === 0 && (
								<div className="flex flex-col items-center justify-center gap-3 py-16 text-center border rounded-xl bg-card">
									<QuestionMarkCircleIcon className="size-10 text-muted-foreground/20" />
									<p className="text-sm text-muted-foreground">
										{search
											? `No models match "${search}"`
											: showFilter === "installed"
												? "No installed models in this filter � try All."
												: "No models in this category"}
									</p>
									{(search ||
										showFilter !== "all" ||
										activeCategory !== "all") && (
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setSearch("");
												setShowFilter("all");
												setActiveCategory("all");
											}}
										>
											Clear filters
										</Button>
									)}
								</div>
							)}

						{/* Product grid */}
						<div className="space-y-8">
							{groups.map(([category, items]) => {
								const isTranslation = category === "translation";
								if (isTranslation) {
									return (
										<section key={category}>
											<button
												type="button"
												onClick={() => setTranslationExpanded((v) => !v)}
												className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-3 text-left hover:bg-muted/50 transition-colors"
												aria-expanded={translationExpanded}
											>
												<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
													{CATEGORY_LABELS[category] ?? category} �{" "}
													{(items as MarketplaceProduct[]).length} packs
												</span>
												<span className="text-xs text-muted-foreground">
													{translationExpanded ? "Hide" : "Show"} ?
												</span>
											</button>
											{translationExpanded && (
												<div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
													{(items as MarketplaceProduct[]).map((p) => {
														const m = getProductModelStatus(p.id, models);
														const dl = downloadProgressMap.get(p.id);
														const isDl = !!dl;
														return (
															<StoreProductCard
																key={p.id}
																product={p}
																model={m}
																owned={owned.has(p.id)}
																installed={installed.has(p.id)}
																localStatus={localStatusById.get(p.id)}
																isDownloading={isDl}
																downloadTask={dl}
																busy={
																	pendingDownload === p.id ||
																	downloadMut.isPending
																}
																wishlisted={wishlist.has(p.id)}
																onToggleWishlist={(id) => {
																	setWishlist((prev) => {
																		const next = new Set(prev);
																		if (next.has(id)) {
																			next.delete(id);
																		} else {
																			next.add(id);
																		}
																		return next;
																	});
																	try {
																		const deviceId = getDeviceId();
																		if (wishlist.has(id)) {
																			void marketplaceClient.removeWishlist(
																				id,
																				deviceId,
																			);
																		} else {
																			void marketplaceClient.addWishlist(
																				id,
																				deviceId,
																			);
																		}
																	} catch {}
																}}
																onDetail={setDetailProduct}
																onQuickDownload={(id) => downloadMut.mutate(id)}
																onCancel={(id) => cancelMut.mutate(id)}
																onDelete={(id) => {
																	const product =
																		products.find((x) => x.id === id) ?? p;
																	if (
																		window.confirm(
																			`Delete "${product.name}"? This frees disk space. You can re-download anytime.`,
																		)
																	) {
																		deleteMut.mutate(id);
																	}
																}}
															/>
														);
													})}
												</div>
											)}
										</section>
									);
								}
								return (
									<section key={category || "all"}>
										{category && (
											<h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
												{CATEGORY_LABELS[category] ?? category}
											</h2>
										)}
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
											{(items as MarketplaceProduct[]).map((p) => {
												const m = getProductModelStatus(p.id, models);
												const dl = downloadProgressMap.get(p.id);
												const isDl = !!dl;
												return (
													<StoreProductCard
														key={p.id}
														product={p}
														model={m}
														owned={owned.has(p.id)}
														installed={installed.has(p.id)}
														localStatus={localStatusById.get(p.id)}
														isDownloading={isDl}
														downloadTask={dl}
														busy={
															pendingDownload === p.id || downloadMut.isPending
														}
														wishlisted={wishlist.has(p.id)}
														onToggleWishlist={(id) => {
															setWishlist((prev) => {
																const next = new Set(prev);
																if (next.has(id)) {
																	next.delete(id);
																} else {
																	next.add(id);
																}
																return next;
															});
															// Sync to marketplace service
															try {
																const deviceId = getDeviceId();
																if (wishlist.has(id)) {
																	void marketplaceClient.removeWishlist(
																		id,
																		deviceId,
																	);
																} else {
																	void marketplaceClient.addWishlist(
																		id,
																		deviceId,
																	);
																}
															} catch {}
														}}
														onDetail={setDetailProduct}
														onQuickDownload={(id) => downloadMut.mutate(id)}
														onCancel={(id) => cancelMut.mutate(id)}
														onDelete={(id) => {
															const product =
																products.find((x) => x.id === id) ?? p;
															if (
																window.confirm(
																	`Delete "${product.name}"? This frees disk space. You can re-download anytime.`,
																)
															) {
																deleteMut.mutate(id);
															}
														}}
													/>
												);
											})}
										</div>
									</section>
								);
							})}{" "}
						</div>

						<p className="text-center text-xs text-muted-foreground/60 pt-2">
							All purchases are one-time, signed offline licenses. Downloads,
							deletes, and license installs happen only here.
						</p>
					</>
				)}
			</div>

			<StoreDetailModal
				product={detailProduct}
				model={detailModel}
				owned={detailProduct ? owned.has(detailProduct.id) : false}
				installed={detailProduct ? installed.has(detailProduct.id) : false}
				downloadTask={detailTask}
				isDownloading={isDetailDownloading}
				open={!!detailProduct}
				onOpenChange={(open) => {
					if (!open) {
						setDetailProduct(null);
					}
				}}
				onProductChange={setDetailProduct}
				onDownload={(id) => downloadMut.mutateAsync(id)}
				onCancel={(id) => cancelMut.mutate(id)}
				onDelete={(id) => deleteMut.mutate(id)}
			/>
		</div>
	);
}
