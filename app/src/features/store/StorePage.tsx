import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { MarketplaceProduct } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { getDeviceId, marketplaceClient } from "@/lib/marketplace";
import { cn } from "@/lib/utils/cn";
import { isProductNew, useProductStore } from "@/stores/productStore";
import { Button } from "@/ui/button";
import { PageTabs } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";
import { BrowseStates } from "./BrowseStates";
import { DonateCard } from "./DonateCard";
import { useDeviceCapabilitiesStore } from "./deviceCapabilitiesStore";
import { HintBanner } from "./HintBanner";
import { LicensesView } from "./LicensesView";
import { OffersBanner } from "./OffersBanner";
import { PerEngineKeepaliveRow } from "./PerEngineKeepaliveRow";
import { PricingAdmin } from "./PricingAdmin";
import { ProductGrid } from "./ProductGrid";
import { StoreDetailModal } from "./StoreDetailModal";
import { StoreFilters } from "./StoreFilters";
import { StoreHero } from "./StoreHero";
import type { CategoryId, SortMode, UseCaseId } from "./storeUtils";
import {
	buildDownloadProgressMap,
	buildErroredDownloads,
	buildFilteredProducts,
	getProductModelStatus,
} from "./storeUtils";

type StoreView = "browse" | "licenses" | "pricing";
type ShowFilter = "all" | "installed" | "available" | "paid" | "free";

/** Subtle, dismissible hint shown when the remote-catalog refresh fails. */
const REFRESH_FAILED_HINT =
	"Couldn't refresh the catalog from the marketplace service — showing the last synced version. It will retry automatically.";

/** Subtle, dismissible hint shown when a model download fails to start. */
const DOWNLOAD_FAILED_HINT =
	"A model download couldn't be started — check your connection and disk space, then try again.";

export function StorePage() {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const [search, setSearch] = useState("");
	const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
	const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("all");
	const [showFilter, setShowFilter] = useState<ShowFilter>("all");
	const [showWishlistOnly, setShowWishlistOnly] = useState(false);
	const [sortMode, setSortMode] = useState<SortMode>("default");
	const [storeView, setStoreView] = useState<StoreView>("browse");
	const [detailProduct, setDetailProduct] = useState<MarketplaceProduct | null>(
		null,
	);
	const [pendingDownload, setPendingDownload] = useState<string | null>(null);
	const [activatingId, setActivatingId] = useState<string | null>(null);
	const [wishlist, setWishlist] = useState<Set<string>>(new Set());
	const [refreshHint, setRefreshHint] = useState<string | null>(null);
	const [downloadHint, setDownloadHint] = useState<string | null>(null);
	const firstSeenAt = useProductStore((s) => s.firstSeenAt);
	const lastSeenCatalogAt = useProductStore((s) => s.lastSeenCatalogAt);
	const recordProducts = useProductStore((s) => s.recordProducts);
	const markCatalogSeen = useProductStore((s) => s.markCatalogSeen);

	// Catalog — the signed local catalog already carries per-product
	// `local_status` (cached | not_downloaded) annotated by the backend.
	const catalog = useQuery({
		queryKey: ["marketplace", "catalog"],
		queryFn: () => apiClient.getCatalog(),
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
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 1000 * 30,
		refetchInterval: 30_000,
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
	// Device capabilities: RAM/VRAM/CPU + per-model compatibility
	const deviceCaps = useDeviceCapabilitiesStore();
	useEffect(() => {
		void deviceCaps.fetch();
	}, [deviceCaps.fetch]);
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
	const wishlistQ = useQuery({
		queryKey: ["marketplace", "wishlist"],
		queryFn: async () => {
			try {
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
	// Nudge the stale-gated remote-catalog refresh when the Store opens, so
	// newly published models appear without an app restart. The backend is a
	// cheap no-op when the catalog is fresh (no network, no lock); only a
	// successful swap triggers a refetch here. Offline-first: a failed nudge
	// keeps the bundled catalog — but surfaces as a subtle dismissible hint
	// rather than failing silently.
	useEffect(() => {
		let cancelled = false;
		void apiClient
			.refreshCatalog()
			.then((res) => {
				if (cancelled) {
					return;
				}
				if (res.refreshed) {
					setRefreshHint(null);
					void queryClient.invalidateQueries({
						queryKey: ["marketplace", "catalog"],
					});
				} else if (res.reason === "failed") {
					setRefreshHint(REFRESH_FAILED_HINT);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setRefreshHint(REFRESH_FAILED_HINT);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [queryClient]);

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
		for (const p of catalog.data?.products ?? []) {
			if (p.local_status) {
				m.set(p.id, p.local_status);
			}
		}
		return m;
	}, [catalog.data]);

	// "New" badge bookkeeping. The backend re-stamps `signed_at` on every
	// fetch, so the *current* document's stamp is not a stable introduction
	// time — instead, the first fetch in which each product id is ever seen
	// records that stamp as the product's introduction (`firstSeenAt`), and
	// the marker advances when the user LEAVES the Store. Products present
	// at first launch are never "New" (their introduction equals the
	// initial marker); products introduced later stay badged until the user
	// visits and then leaves the Store.
	const catalogSignedAt = catalog.data?.signed_at ?? "";
	const catalogProductIds = useMemo(
		() => (catalog.data?.products ?? []).map((p) => p.id),
		[catalog.data],
	);
	const storeViewRef = useRef(storeView);
	useEffect(() => {
		storeViewRef.current = storeView;
	}, [storeView]);
	useEffect(() => {
		if (!catalogSignedAt || catalogProductIds.length === 0) {
			return;
		}
		recordProducts(catalogSignedAt, catalogProductIds);
		if (!useProductStore.getState().lastSeenCatalogAt) {
			// First ever Store open: baseline — nothing is "New" yet.
			markCatalogSeen(catalogSignedAt);
		}
	}, [catalogSignedAt, catalogProductIds, recordProducts, markCatalogSeen]);
	// Advance the marker on unmount (leaving the Store tab/route) or when
	// switching away from the "browse" view — not on fetch, which would
	// clear the badges before they ever render.
	useEffect(() => {
		return () => {
			if (storeViewRef.current === "browse") {
				const latest = useProductStore.getState();
				if (latest.lastSeenCatalogAt !== catalogSignedAtRef.current) {
					latest.markCatalogSeen(catalogSignedAtRef.current);
				}
			}
		};
	}, []);
	const catalogSignedAtRef = useRef(catalogSignedAt);
	useEffect(() => {
		catalogSignedAtRef.current = catalogSignedAt;
	}, [catalogSignedAt]);
	const newIds = useMemo(() => {
		const s = new Set<string>();
		for (const p of catalog.data?.products ?? []) {
			const intro = firstSeenAt[p.id];
			if (isProductNew(intro, lastSeenCatalogAt)) {
				s.add(p.id);
			}
		}
		return s;
	}, [catalog.data, lastSeenCatalogAt, firstSeenAt]);
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
	const groups = useMemo<[string, MarketplaceProduct[]][]>(() => {
		if (
			activeCategory !== "all" ||
			activeUseCase !== "all" ||
			search.trim() ||
			showFilter !== "all" ||
			showWishlistOnly
		) {
			return [["", filtered]];
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

	const categoryCounts = useMemo(() => {
		const m: Record<string, number> = {};
		for (const p of products) {
			m[p.category] = (m[p.category] ?? 0) + 1;
		}
		return m;
	}, [products]);
	const freeCount = products.filter((p) => !p.paid).length;
	const paidCount = products.filter((p) => p.paid).length;
	const installedCount = installed.size;

	// -- Mutations (only here) --
	// Manual "Check for updates": force a remote-catalog refresh regardless of
	// staleness (bypasses the 24h gate), then refetch when a swap happened.
	// Offline-first: a failure or an unconfigured OTOYIN_CATALOG_URL reports
	// refreshed: false and leaves the current catalog in place.
	const checkUpdatesMut = useMutation({
		mutationFn: () => apiClient.refreshCatalog(true),
		onSuccess: async (res) => {
			if (res.refreshed) {
				setRefreshHint(null);
				toast({
					title: "Catalog updated",
					description: "New models are available — take a look.",
				});
				await queryClient.invalidateQueries({
					queryKey: ["marketplace", "catalog"],
				});
			} else if (res.reason === "failed") {
				// A genuine fetch/verify failure: subtle hint, not a toast —
				// avoid claiming "up to date" when we couldn't check.
				setRefreshHint(REFRESH_FAILED_HINT);
			} else {
				toast({
					title: "You're up to date",
					description: "No new products right now — check back later.",
				});
			}
		},
		onError: () => setRefreshHint(REFRESH_FAILED_HINT),
	});
	const downloadMut = useMutation({
		mutationFn: (id: string) => apiClient.triggerModelDownload(id),
		onMutate: (id) => setPendingDownload(id),
		onSuccess: async () => {
			setDownloadHint(null);
			await queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
			await queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
		},
		onError: (err) => {
			// Subtle non-blocking hint instead of a toast: the user should keep
			// browsing while deciding whether to retry. Clears on the next
			// successful download start or when dismissed.
			setDownloadHint(
				err instanceof Error && err.message
					? `${DOWNLOAD_FAILED_HINT} (${err.message})`
					: DOWNLOAD_FAILED_HINT,
			);
		},
		onSettled: () => setPendingDownload(null),
	});
	const cancelMut = useMutation({
		mutationFn: (id: string) => apiClient.cancelDownload(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
			await queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
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
			await queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
			await queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
		},
		onError: (e) => showStudioErrorToast(e),
	});
	// One-step Activate for cached models: load the engine so it becomes the
	// active, ready-to-generate engine (engine name from model-status, the
	// same resolution EngineModelSelector uses).
	const activateMut = useMutation({
		mutationFn: async (id: string) => {
			const m = models?.find((x) => x.model_name === id);
			return apiClient.loadModel(m?.engine ?? id, "default", m?.model_name);
		},
		onMutate: (id) => setActivatingId(id),
		onSuccess: async (_data, id) => {
			const m = models?.find((x) => x.model_name === id);
			toast({ title: "Engine activated", description: m?.display_name ?? id });
			await queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
		},
		onError: (e) => showStudioErrorToast(e),
		onSettled: () => setActivatingId(null),
	});

	const handleToggleWishlist = (id: string) => {
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
				void marketplaceClient.removeWishlist(id, deviceId);
			} else {
				void marketplaceClient.addWishlist(id, deviceId);
			}
		} catch {}
	};

	const detailModel = detailProduct
		? getProductModelStatus(detailProduct.id, models)
		: undefined;
	const detailTask = detailProduct
		? downloadProgressMap.get(detailProduct.id)
		: undefined;
	const isDetailDownloading = !!detailTask;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
				<StoreHero
					productCount={products.length}
					freeCount={freeCount}
					paidCount={paidCount}
					installedCount={installedCount}
					isOfflineCatalog={isOfflineCatalog}
					cacheDirPath={cacheDirQ.data?.path}
					wishlistSize={wishlist.size}
					wishlistOnly={showWishlistOnly}
					checkingUpdates={checkUpdatesMut.isPending}
					onCheckUpdates={() => checkUpdatesMut.mutate()}
					onRefresh={() => {
						void catalog.refetch();
						void modelsStatus.refetch();
						void activeTasksQ.refetch();
					}}
					onToggleWishlistOnly={() => setShowWishlistOnly((v) => !v)}
				/>{" "}
				{/* Subtle non-blocking hints: remote-catalog refresh and model
					    download failures. Dismissible; clear on the next success. */}
				{refreshHint && (
					<HintBanner
						message={refreshHint}
						onDismiss={() => setRefreshHint(null)}
					/>
				)}
				{downloadHint && (
					<HintBanner
						message={downloadHint}
						onDismiss={() => setDownloadHint(null)}
					/>
				)}
				{/* View tabs */}
				<PageTabs>
					{(
						[
							["browse", "Browse Models"],
							[
								"licenses",
								`My Licenses${licensesQ.data?.licenses?.length ? ` (${licensesQ.data.licenses.length})` : ""}`,
							],
							["pricing", "Pricing Admin"],
						] as [StoreView, string][]
					).map(([tab, label]) => (
						<Button
							key={tab}
							variant="ghost"
							size="sm"
							onClick={() => setStoreView(tab)}
							className={cn(
								"rounded-md",
								storeView === tab &&
									"bg-secondary text-foreground hover:bg-secondary",
							)}
						>
							{label}
						</Button>
					))}
				</PageTabs>
				<OffersBanner offers={offersQ.data ?? []} onOpen={setDetailProduct} />
				<DonateCard />
				{storeView === "pricing" ? (
					<PricingAdmin />
				) : storeView === "licenses" ? (
					<LicensesView
						isLoading={licensesQ.isLoading}
						licenses={licensesQ.data?.licenses}
						entitlements={entitlements.data?.entitlements}
					/>
				) : (
					/* -- Browse view ----------------------------------------- */
					<div className="space-y-3">
						<StoreFilters
							search={search}
							onSearch={setSearch}
							showFilter={showFilter}
							onShowFilter={setShowFilter}
							sortMode={sortMode}
							onSortMode={setSortMode}
							activeCategory={activeCategory}
							onCategory={setActiveCategory}
							activeUseCase={activeUseCase}
							onUseCase={setActiveUseCase}
							categoryCounts={categoryCounts}
							totalCount={products.length}
						/>

						<PerEngineKeepaliveRow models={models} />

						<BrowseStates
							errored={errored}
							loading={catalog.isLoading || modelsStatus.isLoading}
							isOfflineCatalog={isOfflineCatalog}
							filteredLength={filtered.length}
							search={search}
							showFilter={showFilter}
							activeCategory={activeCategory}
							onClearErrors={async () => {
								await apiClient.clearAllTasks();
								await queryClient.invalidateQueries({
									queryKey: ["activeTasks"],
								});
							}}
							onRetry={() => catalog.refetch()}
							onRetryDownloads={() => {
								// Re-trigger every failed download via the same mutation
								// the card's Download button uses — its onSuccess/onError
								// already maintain the hint and refresh the queries.
								for (const id of errored.keys()) {
									downloadMut.mutate(id);
								}
							}}
							onClearFilters={() => {
								setSearch("");
								setShowFilter("all");
								setActiveCategory("all");
							}}
						/>

						{/* Product grid */}
						{!catalog.isLoading &&
							!modelsStatus.isLoading &&
							filtered.length > 0 && (
								<ProductGrid
									groups={groups}
									models={models}
									modelCompat={deviceCaps.modelCompat}
									owned={owned}
									installed={installed}
									localStatusById={localStatusById}
									downloadProgressMap={downloadProgressMap}
									wishlist={wishlist}
									pendingDownload={pendingDownload}
									activatingId={activatingId}
									newIds={newIds}
									onDetail={setDetailProduct}
									onQuickDownload={(id) => downloadMut.mutate(id)}
									onCancel={(id) => cancelMut.mutate(id)}
									onDelete={(id) => {
										const product =
											products.find((x) => x.id === id) ??
											filtered.find((x) => x.id === id);
										if (
											window.confirm(
												`Delete "${product?.name ?? id}"? This frees disk space. You can re-download anytime.`,
											)
										) {
											deleteMut.mutate(id);
										}
									}}
									onActivate={(id) => activateMut.mutate(id)}
									onToggleWishlist={handleToggleWishlist}
								/>
							)}

						<p className="pt-2 text-center text-xs text-muted-foreground/60">
							All purchases are one-time, signed offline licenses. Downloads,
							deletes, and license installs happen only here.
						</p>
					</div>
				)}
			</div>

			<StoreDetailModal
				product={detailProduct}
				model={detailModel}
				owned={detailProduct ? owned.has(detailProduct.id) : false}
				installed={detailProduct ? installed.has(detailProduct.id) : false}
				localStatus={
					detailProduct ? localStatusById.get(detailProduct.id) : undefined
				}
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
				activating={activatingId === detailProduct?.id}
				onActivate={(id) => activateMut.mutate(id)}
			/>
		</div>
	);
}
