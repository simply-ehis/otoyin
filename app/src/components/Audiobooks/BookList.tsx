import { BookOpenIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "@/components/ui/skeleton";
import type { AudiobookSummary } from "@/lib/api/clientAudiobooks";
import { useDeleteAudiobook } from "@/lib/hooks/useAudiobooks";
import { useAudiobookStore } from "@/stores/audiobookStore";

export function BookList({
	books,
	isLoading,
	error,
	onRefresh,
}: {
	books: AudiobookSummary[];
	isLoading: boolean;
	error: Error | null;
	onRefresh: () => void;
}) {
	const selectedId = useAudiobookStore((s) => s.selectedId);
	const setSelectedId = useAudiobookStore((s) => s.setSelectedId);
	const deleteBook = useDeleteAudiobook();

	return (
		<div className="flex flex-col flex-1 min-h-0 overflow-hidden border rounded-lg bg-card">
			<div className="px-3 py-2 text-sm font-medium border-b">
				Audiobooks ({books.length})
			</div>
			<div className="flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="flex flex-col gap-1 p-2">
						{["s1", "s2", "s3", "s4"].map((k) => (
							<Skeleton key={k} className="h-12 w-full" />
						))}
					</div>
				) : error ? (
					<div className="flex flex-col items-center justify-center py-8 text-center px-4">
						<p className="text-xs font-medium text-destructive">
							Failed to load audiobooks
						</p>
						<button
							type="button"
							onClick={onRefresh}
							className="mt-2 text-xs text-accent hover:underline"
						>
							Retry
						</button>
					</div>
				) : books.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-8 text-center px-4">
						<BookOpenIcon className="size-8 text-muted-foreground/30 mb-2" />
						<p className="text-xs text-muted-foreground leading-relaxed">
							Import your first audiobook
							<br />
							<span className="text-muted-foreground/60">
								EPUB or PDF to get started
							</span>
						</p>
					</div>
				) : (
					books.map((b) => (
						<button
							key={b.id}
							type="button"
							onClick={() => setSelectedId(b.id)}
							className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/50 ${selectedId === b.id ? "bg-muted" : ""}`}
						>
							<BookOpenIcon className="size-4 shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="text-sm truncate">{b.title}</div>
								<div className="text-xs text-muted-foreground truncate">
									{b.author || "Unknown"} · {b.chapter_count} chapters
								</div>
							</div>
							<button
								type="button"
								aria-label="Delete book"
								onClick={(e) => {
									e.stopPropagation();
									if (!confirm(`Delete "${b.title}"?`)) {
										return;
									}
									deleteBook.mutate(b.id);
								}}
								className="p-1 text-destructive/60 hover:text-destructive"
							>
								<TrashIcon className="size-4" />
							</button>
						</button>
					))
				)}
			</div>
		</div>
	);
}
