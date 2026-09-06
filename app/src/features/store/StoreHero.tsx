import {
	ArrowPathIcon,
	CloudArrowDownIcon,
	FolderOpenIcon,
	ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/ui/button";

interface Props {
	productCount: number;
	freeCount: number;
	paidCount: number;
	installedCount: number;
	isOfflineCatalog: boolean;
	cacheDirPath: string | undefined;
	wishlistSize: number;
	wishlistOnly: boolean;
	checkingUpdates: boolean;
	onCheckUpdates: () => void;
	onRefresh: () => void;
	onToggleWishlistOnly: () => void;
}

/** Marketplace hero: counts, offline badge, refresh + wishlist actions, cache dir. */
export function StoreHero({
	productCount,
	freeCount,
	paidCount,
	installedCount,
	isOfflineCatalog,
	cacheDirPath,
	wishlistSize,
	wishlistOnly,
	checkingUpdates,
	onCheckUpdates,
	onRefresh,
	onToggleWishlistOnly,
}: Props) {
	return (
		<header className="relative overflow-hidden rounded-xl border bg-card p-5">
			<div
				className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-accent opacity-[0.08] blur-3xl"
				aria-hidden
			/>
			<div className="relative flex flex-wrap items-start justify-between gap-4">
				<div className="flex gap-3">
					{" "}
					<div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-muted">
						<ShoppingBagIcon className="size-6 text-accent" />
					</div>
					<div>
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							Marketplace
						</h1>
						<p className="mt-1 max-w-xl text-sm text-muted-foreground">
							<span className="font-medium text-foreground">
								{productCount} models
							</span>{" "}
							— {freeCount} free, {paidCount} one-time paid. Every download is a
							signed, offline-first install.
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{installedCount} installed on this device
							{isOfflineCatalog && (
								<span className="ml-2 rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 font-medium text-warning-text">
									Offline catalog
								</span>
							)}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={onCheckUpdates}
						disabled={checkingUpdates}
						title="Fetch the latest catalog from the marketplace service"
					>
						{checkingUpdates ? (
							<ArrowPathIcon className="size-4 animate-spin" />
						) : (
							<CloudArrowDownIcon className="size-4" />
						)}
						{checkingUpdates ? "Checking…" : "Check for updates"}
					</Button>
					<Button variant="outline" size="sm" onClick={onRefresh}>
						<ArrowPathIcon className="size-4" />
						Refresh
					</Button>
					<Button variant="secondary" size="sm" onClick={onToggleWishlistOnly}>
						{wishlistOnly
							? "All products"
							: wishlistSize > 0
								? `Wishlist (${wishlistSize})`
								: "Wishlist"}
					</Button>
				</div>
				<div className="mt-4 flex w-full flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
					<FolderOpenIcon className="size-3.5 shrink-0" />
					<span className="font-mono truncate max-w-[28rem]">
						{cacheDirPath ?? "…"}
					</span>
				</div>
			</div>
		</header>
	);
}
