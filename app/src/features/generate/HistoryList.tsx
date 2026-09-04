import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUturnLeftIcon,
	EllipsisHorizontalIcon,
	PauseIcon,
	PlayIcon,
	StarIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { useMutation, useQueryClient } from "@tanstack/react-query";import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { EmptyState, LoadingState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { HistoryResponse } from "@/lib/api/types";
import { formatDate, formatDuration } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
	useClearFailedGenerations,
	useDeleteGeneration,
	useExportGeneration,
	useExportGenerationAudio,
	useHistory,
	useImportGeneration,
} from "@/lib/hooks/useHistory";
import { showStudioErrorToast } from "@/lib/errors";
import { usePlayerStore } from "@/stores/playerStore";

const PAGE_SIZE = 20;

/**
 * Generation history: virtualized infinite list. Rows play/stop in the
 * shared player, download audio, retry failures, favorite, delete
 * (confirmed), export packages, and import from disk.
 */
export function HistoryList() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [page, setPage] = useState(0);
	const [items, setItems] = useState<HistoryResponse[]>([]);
	const [total, setTotal] = useState(0);
	const [deleteTarget, setDeleteTarget] = useState<HistoryResponse | null>(null);
	const [clearFailedOpen, setClearFailedOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [importFile, setImportFile] = useState<File | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const { data, isLoading, isFetching } = useHistory({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
	});
	const deleteMut = useDeleteGeneration();
	const clearFailedMut = useClearFailedGenerations();
	const exportAudio = useExportGenerationAudio();
	const exportZip = useExportGeneration();
	const importMut = useImportGeneration();
	const cancelMut = useMutation({
		mutationFn: (id: string) => apiClient.cancelGeneration(id),
		onSuccess: (res) => {
			void queryClient.invalidateQueries({ queryKey: ["history"] });
			toast({ title: "Cancelling generation", description: res.message });
		},
		onError: (e: unknown) =>
			toast({
				title: "Cancel failed",
				description: e instanceof Error ? e.message : "Could not cancel generation",
				variant: "destructive",
			}),
	});

	useEffect(() => {
		if (!data?.items) {
			return;
		}
		setItems((prev) => {
			const seen = new Set(prev.map((g) => g.id));
			return [...prev, ...data.items.filter((g) => !seen.has(g.id))];
		});
		setTotal(data.total);
	}, [data]);

	useEffect(() => {
		const el = loadMoreRef.current;
		if (!el) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !isFetching && items.length < total) {
					setPage((p) => p + 1);
				}
			},
			{ root: scrollRef.current, rootMargin: "100px", threshold: 0.1 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [isFetching, items.length, total]);

	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 96,
		overscan: 5,
	});

	const failedCount = items.filter((g) => g.status === "failed").length;

	if (isLoading && page === 0) {
		return <LoadingState label="Loading history" lines={5} />;
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground">
					History
					<span className="ml-2 font-normal tabular-nums text-muted-foreground">
						{total}
					</span>
				</h3>
				<span className="flex items-center gap-1">
					{failedCount > 0 ? (
						<>
							<span className="text-xs text-muted-foreground">
								{failedCount} failed
							</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs"
								disabled={clearFailedMut.isPending}
								onClick={() => setClearFailedOpen(true)}
							>
								{clearFailedMut.isPending ? "Clearing…" : "Clear failed"}
							</Button>
						</>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={() => {
							setImportFile(null);
							setImportOpen(true);
						}}
					>
						Import
					</Button>
				</span>
			</div>

			{items.length === 0 ? (
				<EmptyState
					title="No generations yet"
					body="Your audio captures will appear here. Generate your first voice line to get started."
				/>
			) : (
				<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-4">
					<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
						{virtualizer.getVirtualItems().map((row) => {
							const gen = items[row.index];
							return gen ? (
								<HistoryRow
									key={gen.id}
									gen={gen}
									start={row.start}
									cancelPending={cancelMut.isPending}
									onCancel={(id) => cancelMut.mutate(id)}
									onDelete={setDeleteTarget}
								/>
							) : null;
						})}
					</div>
					{items.length < total ? (
						<div ref={loadMoreRef} className="flex items-center justify-center py-4" role="status" aria-label="Loading more">
							{isFetching ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" aria-hidden="true" /> : null}
						</div>
					) : items.length > 0 ? (
						<p className="py-4 text-center text-xs text-muted-foreground">
							You have reached the end
						</p>
					) : null}
				</div>
			)}

			<input
				ref={fileRef}
				type="file"
				accept=".json"
				className="hidden"
				aria-label="Import generation file"
				onChange={(e) => {
					setImportFile(e.target.files?.[0] ?? null);
					setImportOpen(true);
				}}
			/>

			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogTitle>Delete generation?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently removes this generation and its audio. This cannot be undone.
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (deleteTarget) {
									deleteMut.mutate(deleteTarget.id, {
										onError: (e: unknown) => showStudioErrorToast(e),
									});
									setDeleteTarget(null);
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={clearFailedOpen} onOpenChange={setClearFailedOpen}>
				<AlertDialogContent>
					<AlertDialogTitle>Clear failed generations?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently removes every generation with a failed status.
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								clearFailedMut.mutate(undefined, {
									onError: (e: unknown) => showStudioErrorToast(e),
								});
								setClearFailedOpen(false);
							}}
						>
							Clear failed
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={importOpen} onOpenChange={setImportOpen}>
				<AlertDialogContent>
					<AlertDialogTitle>Import generation</AlertDialogTitle>
					<AlertDialogDescription>
						{importFile
							? `Import ${importFile.name} into your history?`
							: "Choose a previously exported generation file."}
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						{!importFile ? (
							<Button size="sm" onClick={() => fileRef.current?.click()}>
								Choose file
							</Button>
						) : (
							<AlertDialogAction
								onClick={() => {
									importMut.mutate(importFile, {
										onSuccess: () => {
											setImportOpen(false);
											setImportFile(null);
										},
										onError: (e: unknown) => showStudioErrorToast(e),
									});
								}}
							>
								Import
							</AlertDialogAction>
						)}
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function HistoryRow({
	gen,
	start,
	cancelPending,
	onCancel,
	onDelete,
}: {
	gen: HistoryResponse;
	start: number;
	cancelPending: boolean;
	onCancel: (id: string) => void;
	onDelete: (gen: HistoryResponse) => void;
}) {
	const audioId = usePlayerStore((s) => s.audioId);
	const isPlaying = usePlayerStore((s) => s.isPlaying);
	const setAudioWithAutoPlay = usePlayerStore((s) => s.setAudioWithAutoPlay);
	const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
	const queryClient = useQueryClient();
	const invalidateHistory = () =>
		void queryClient.invalidateQueries({ queryKey: ["history"] });
	const exportAudio = useExportGenerationAudio();
	const exportZip = useExportGeneration();
	const toggleFavorite = useMutation({
		mutationFn: () => apiClient.toggleFavorite(gen.id),
		onSuccess: invalidateHistory,
		onError: (e: unknown) => showStudioErrorToast(e),
	});
	const retry = useMutation({
		mutationFn: () => apiClient.retryGeneration(gen.id),
		onSuccess: invalidateHistory,
		onError: (e: unknown) => showStudioErrorToast(e),
	});
	const regenerate = useMutation({
		mutationFn: () => apiClient.regenerateGeneration(gen.id),
		onSuccess: invalidateHistory,
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const playing = audioId === gen.id && isPlaying;
	const pending = gen.status === "loading_model" || gen.status === "generating";
	const failed = gen.status === "failed";
	const playable = !pending && !failed;

	const play = () => {
		if (!playable) {
			return;
		}
		if (playing) {
			setIsPlaying(false);
			return;
		}
		setAudioWithAutoPlay(apiClient.getAudioUrl(gen.id), gen.id, "", "");
	};

	return (
		<div
			className="absolute left-0 top-0 w-full"
			style={{ transform: `translateY(${start}px)` }}
		>
			<div
				className={cn(
					"w-full rounded-md border border-border bg-card p-3 text-left",
					playing && "border-accent/40",
				)}
			>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={pending ? () => onCancel(gen.id) : play}
						disabled={failed || (pending && cancelPending)}
						title={pending ? "Cancel generation" : playing ? "Pause" : "Play"}
						aria-label={pending ? `Cancel generation for ${gen.profile_name}` : `${playing ? "Pause" : "Play"} sample from ${gen.profile_name}`}
						className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary-hover disabled:opacity-40"
					>
						{pending ? (
							<XMarkIcon className="size-4" aria-hidden="true" />
						) : playing ? (
							<PauseIcon className="size-4" aria-hidden="true" />
						) : (
							<PlayIcon className="size-4" aria-hidden="true" />
						)}
					</button>
					<button
						type="button"
						onClick={play}
						disabled={!playable}
						aria-label={`Sample from ${gen.profile_name}, ${formatDuration(gen.duration ?? 0)}, ${formatDate(gen.created_at)}${playing ? ". Playing." : ". Press Enter to play."}`}
						className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
					>
						<p className="truncate text-sm font-medium text-foreground">{gen.text}</p>
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{gen.profile_name} · {formatEngine(gen.engine)} · {formatDuration(gen.duration ?? 0)} · {formatDate(gen.created_at)}
							{failed && gen.error ? ` · ${gen.error}` : ""}
							{pending ? " · generating…" : ""}
						</p>
					</button>
					<button
						type="button"
						title={gen.is_favorited ? "Remove favorite" : "Mark favorite"}
						aria-label={gen.is_favorited ? "Remove favorite" : "Mark favorite"}
						aria-pressed={!!gen.is_favorited}
						onClick={() => toggleFavorite.mutate()}
						className={cn(
							"grid size-7 shrink-0 place-items-center rounded-sm transition-colors",
							gen.is_favorited ? "text-accent" : "text-muted-foreground/50 hover:text-foreground",
						)}
					>
						{gen.is_favorited ? (
							<StarSolid className="size-4" aria-hidden="true" />
						) : (
							<StarIcon className="size-4" aria-hidden="true" />
						)}
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								title="More actions"
								aria-label={`More actions for generation ${gen.id}`}
								className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							>
								<EllipsisHorizontalIcon className="size-4" aria-hidden="true" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() =>
									exportAudio.mutate(
										{ generationId: gen.id, text: gen.text },
										{ onError: (e: unknown) => showStudioErrorToast(e) },
									)
								}
							>
								<ArrowDownTrayIcon className="size-4" aria-hidden="true" />
								Download audio
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									exportZip.mutate(
										{ generationId: gen.id, text: gen.text },
										{ onError: (e: unknown) => showStudioErrorToast(e) },
									)
								}
							>
								<ArrowDownTrayIcon className="size-4" aria-hidden="true" />
								Export package
							</DropdownMenuItem>
							{failed ? (
								<DropdownMenuItem onClick={() => retry.mutate()}>
									<ArrowPathIcon className="size-4" aria-hidden="true" />
									Retry
								</DropdownMenuItem>
							) : null}
							{playable ? (
								<DropdownMenuItem onClick={() => regenerate.mutate()}>
									<ArrowUturnLeftIcon className="size-4" aria-hidden="true" />
									Regenerate
								</DropdownMenuItem>
							) : null}
							<DropdownMenuItem
								className="text-destructive"
								onClick={() => onDelete(gen)}
							>
								<TrashIcon className="size-4" aria-hidden="true" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}

function formatEngine(engine?: string): string {
	return engine ?? "default";
}
