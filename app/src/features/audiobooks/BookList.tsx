import { BookOpenIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import { EmptyState } from "@/ui/states";
import { Spinner } from "@/ui/primitives";
import type { AudiobookSummary } from "@/lib/api/clientAudiobooks";
import { useDeleteAudiobook } from "@/lib/hooks/useAudiobooks";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { cn } from "@/lib/utils/cn";

/**
 * Book rail: loading skeletons, error with retry, empty state,
 * selectable rows with delete (confirmed, no native confirm()).
 */
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
	const [deleting, setDeleting] = useState<AudiobookSummary | null>(null);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card">
			<p className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
				Audiobooks ({books.length})
			</p>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="flex flex-col gap-1 p-2" role="status" aria-label="Loading books">
						{["s1", "s2", "s3", "s4"].map((k) => (
							<div key={k} aria-hidden="true" className="h-12 w-full animate-pulse rounded-sm bg-secondary" />
						))}
					</div>
				) : error ? (
					<div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
						<p className="text-xs font-medium text-destructive">Failed to load audiobooks</p>
						<Button variant="ghost" size="sm" onClick={onRefresh}>
							Retry
						</Button>
					</div>
				) : books.length === 0 ? (
					<div className="px-4 py-4">
						<EmptyState
							icon={<BookOpenIcon aria-hidden="true" />}
							title="No audiobooks"
							body="Import an EPUB or PDF to get started."
						/>
					</div>
				) : (
					<ul>
						{books.map((b) => (
							<li key={b.id}>
								<div
									role="button"
									tabIndex={0}
									onClick={() => setSelectedId(b.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setSelectedId(b.id);
										}
									}}
									aria-current={selectedId === b.id ? "true" : undefined}
									className={cn(
										"flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
										selectedId === b.id ? "bg-secondary" : "hover:bg-secondary",
									)}
								>
									<BookOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm text-foreground">{b.title}</span>
										<span className="block truncate text-xs text-muted-foreground">
											{b.author || "Unknown"} · {b.chapter_count} chapters
										</span>
									</span>
									<button
										type="button"
										title={`Delete ${b.title}`}
										aria-label={`Delete ${b.title}`}
										onClick={(e) => {
											e.stopPropagation();
											setDeleting(b);
										}}
										className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-destructive"
									>
										<TrashIcon className="size-4" aria-hidden="true" />
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			<Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>				<DialogContent>
					<DialogTitle>Delete audiobook?</DialogTitle>
					<DialogDescription>
						This permanently removes “{deleting?.title}” and its rendered audio.
					</DialogDescription>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setDeleting(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleteBook.isPending}
							loading={deleteBook.isPending}
							onClick={() => {
								if (deleting) {
									deleteBook.mutate(deleting.id, {
										onSuccess: () => {
											if (selectedId === deleting.id) {
												setSelectedId(null);
											}
											setDeleting(null);
										},
									});
								}
							}}
						>
							{deleteBook.isPending ? "Deleting…" : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
