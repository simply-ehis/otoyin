import {
	ArrowPathIcon,
	ExclamationTriangleIcon,
	QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import type { ActiveDownloadTask } from "@/lib/api/types";
import { Button } from "@/ui/button";
import { Skeleton } from "@/ui/primitives";
import { HintBanner } from "./HintBanner";

interface Props {
	errored: Map<string, ActiveDownloadTask>;
	loading: boolean;
	isOfflineCatalog: boolean;
	filteredLength: number;
	search: string;
	showFilter: string;
	activeCategory: string;
	onClearErrors: () => void;
	onRetry: () => void;
	/** Re-trigger every failed download (renders the hint's Retry action). */
	onRetryDownloads?: () => void;
	onClearFilters: () => void;
}

/**
 * Browse-view state blocks: failed-download banner, loading skeletons,
 * offline catalog, and the empty state.
 */
export function BrowseStates({
	errored,
	loading,
	isOfflineCatalog,
	filteredLength,
	search,
	showFilter,
	activeCategory,
	onClearErrors,
	onRetry,
	onRetryDownloads,
	onClearFilters,
}: Props) {
	return (
		<>
			{/* Failed-downloads hint — same dismissible HintBanner pattern as
			    every other Store error hint (refresh, download start), plus a
			    one-step Retry so the user doesn't hunt for the card. */}
			{errored.size > 0 && (
				<HintBanner
					message={`${errored.size} download${errored.size > 1 ? "s" : ""} failed: ${Array.from(errored.keys()).join(", ")}`}
					onDismiss={onClearErrors}
					actionLabel="Retry"
					onAction={onRetryDownloads}
					actionTitle="Re-trigger the failed downloads"
				/>
			)}

			{/* Loading skeletons */}
			{loading && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 6 }, (_, i) => i).map((i) => (
						<div
							key={`sk-${i}`}
							className="space-y-3 rounded-xl border bg-card p-4"
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

			{/* Offline — catalog service unreachable */}
			{isOfflineCatalog && !loading && (
				<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-warning/20 bg-card py-16 text-center">
					<ExclamationTriangleIcon className="size-10 text-warning/40" />
					<p className="text-sm font-medium text-foreground">
						Marketplace offline
					</p>
					<p className="max-w-md text-xs text-muted-foreground">
						Could not reach the local catalog service. Check your connection or
						try again.
					</p>
					<Button size="sm" variant="outline" onClick={onRetry}>
						<ArrowPathIcon className="size-4" /> Retry
					</Button>
				</div>
			)}

			{/* Empty */}
			{!isOfflineCatalog && !loading && filteredLength === 0 && (
				<div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card py-16 text-center">
					<QuestionMarkCircleIcon className="size-10 text-muted-foreground/20" />
					<p className="text-sm text-muted-foreground">
						{search
							? `No models match "${search}"`
							: showFilter === "installed"
								? "No installed models in this filter — try All."
								: "No models in this category"}
					</p>
					{(search || showFilter !== "all" || activeCategory !== "all") && (
						<Button size="sm" variant="outline" onClick={onClearFilters}>
							Clear filters
						</Button>
					)}
				</div>
			)}
		</>
	);
}
