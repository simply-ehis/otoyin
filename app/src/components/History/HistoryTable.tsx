import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { AudioEditorPanel } from "@/components/Generation/AudioEditorPanel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/Spinner";
import { BOTTOM_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { cn } from "@/lib/utils/cn";
import {
	ClearFailedDialog,
	DeleteDialog,
	EffectsDialog,
	ImportDialog,
} from "./dialogs";
import { HistoryRow } from "./HistoryRow";
import { useHistoryTable } from "./hooks/useHistoryTable";

export function HistoryTable() {
	const c = useHistoryTable();
	const {
		allHistory,
		total,
		isLoading,
		isFetching,
		isPlayerVisible,
		failedCount,
	} = c;

	const scrollRef = useRef<HTMLDivElement>(null);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: allHistory.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 120,
		overscan: 5,
	});

	// Track scroll position for the gradient effect.
	useEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) {
			return;
		}
		const handleScroll = () => c.setIsScrolled(scrollEl.scrollTop > 0);
		scrollEl.addEventListener("scroll", handleScroll);
		return () => scrollEl.removeEventListener("scroll", handleScroll);
	}, [c]);

	// Infinite scroll via IntersectionObserver.
	useEffect(() => {
		const loadMoreEl = loadMoreRef.current;
		if (!loadMoreEl) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const target = entries[0];
				if (target.isIntersecting && !isFetching && allHistory.length < total) {
					c.setPage((prev) => prev + 1);
				}
			},
			{ root: scrollRef.current, rootMargin: "100px", threshold: 0.1 },
		);
		observer.observe(loadMoreEl);
		return () => observer.disconnect();
	}, [isFetching, allHistory.length, total, c]);

	if (isLoading && c.page === 0) {
		return (
			<div className="flex items-center justify-center h-full">
				<Spinner size="xxl" />
			</div>
		);
	}

	const hasMore = allHistory.length < total;

	return (
		<div className="flex flex-col h-full min-h-0 relative">
			{allHistory.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 flex-1 py-12 px-6">
					<div className="text-center">
						<p className="text-sm font-medium text-foreground">
							{c.t("history.empty")}
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							Generate audio to see it here
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							window.location.href = "/";
						}}
						className="text-xs font-medium text-accent hover:underline"
					>
						Generate your first voice
					</button>
				</div>
			) : (
				<>
					{failedCount > 0 && (
						<div className="flex items-center justify-between px-4 py-2">
							<span className="text-xs text-muted-foreground">
								{failedCount} failed{" "}
								{failedCount === 1 ? "generation" : "generations"}
							</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs text-muted-foreground"
								onClick={() => c.setClearFailedDialogOpen(true)}
								disabled={c.clearFailed.isPending}
							>
								{c.clearFailed.isPending ? "Clearing..." : "Clear failed"}
							</Button>
						</div>
					)}
					<div
						ref={scrollRef}
						className={cn(
							"flex-1 min-h-0 overflow-y-auto pb-4",
							isPlayerVisible && BOTTOM_SAFE_AREA_PADDING,
						)}
					>
						<div
							className="relative w-full"
							style={{ height: virtualizer.getTotalSize() }}
						>
							{virtualizer.getVirtualItems().map((virtualRow) => (
								<HistoryRow
									key={allHistory[virtualRow.index].id}
									gen={allHistory[virtualRow.index]}
									controller={c}
									measureElement={virtualizer.measureElement}
									start={virtualRow.start}
									index={virtualRow.index}
								/>
							))}
						</div>

						{hasMore && (
							<div
								ref={loadMoreRef}
								className="flex items-center justify-center py-4"
							>
								{isFetching && <Spinner size="xl" />}
							</div>
						)}

						{!hasMore && allHistory.length > 0 && (
							<div className="text-center py-4 text-xs text-muted-foreground">
								You've reached the end
							</div>
						)}
					</div>
				</>
			)}

			<input
				ref={c.fileInputRef}
				type="file"
				accept=".json"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0] ?? null;
					c.setSelectedFile(file);
					c.setImportDialogOpen(true);
				}}
			/>

			<DeleteDialog c={c} />
			<ClearFailedDialog c={c} />
			<ImportDialog c={c} />
			<EffectsDialog c={c} />

			{/* Audio Edit Dialog for Step-Audio-EditX */}
			<Dialog
				open={c.editDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						c.setEditDialogOpen(false);
					}
				}}
			>
				<DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit Audio</DialogTitle>
					</DialogHeader>
					{c.editTargetId &&
						(() => {
							const source = c.allHistory.find((g) => g.id === c.editTargetId);
							if (!source) {
								return null;
							}
							return (
								<AudioEditorPanel
									sourceGen={source}
									onClose={() => c.setEditDialogOpen(false)}
									onEditComplete={() => c.handleEditComplete()}
								/>
							);
						})()}
				</DialogContent>
			</Dialog>
		</div>
	);
}
