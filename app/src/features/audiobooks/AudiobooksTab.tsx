import {
	ArrowUpTrayIcon,
	BookOpenIcon,
	PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useEffect } from "react";
import {
	useAudiobookDetail,
	useAudiobookList,
} from "@/lib/hooks/useAudiobooks";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { Button } from "@/ui/button";
import { EmptyState, ErrorState } from "@/ui/states";
import { BookDetail } from "./BookDetail";
import { BookList } from "./BookList";
import { ImportWizard } from "./ImportWizard";

/**
 * Audiobooks: EPUB/PDF import with chapter preview, per-book voice
 * cast, chapter render queue, WAV/.m4b export, format conversion.
 */
export function AudiobooksTab() {
	const selectedId = useAudiobookStore((s) => s.selectedId);
	const setSelectedId = useAudiobookStore((s) => s.setSelectedId);
	const {
		data: books = [],
		isLoading,
		error,
		refetch: refetchBooks,
	} = useAudiobookList();
	const {
		data: detail = null,
		isLoading: detailLoading,
		refetch: refetchDetail,
	} = useAudiobookDetail(selectedId);

	useEffect(() => {
		if (books.length > 0 && !selectedId && books[0]) {
			setSelectedId(books[0].id);
		}
	}, [books, selectedId, setSelectedId]);

	const hasBooks = books.length > 0;

	return (
		<div className="flex h-full min-h-0 gap-4 overflow-hidden">
			<div className="flex min-h-0 w-[360px] shrink-0 flex-col overflow-hidden">
				<ImportWizard onImported={() => void refetchBooks()} />
				<BookList
					books={books}
					isLoading={isLoading}
					error={error as Error | null}
					onRefresh={() => void refetchBooks()}
				/>
			</div>
			<div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
				{detailLoading && selectedId ? (
					<div className="flex flex-col gap-2 p-4">
						<div
							aria-hidden="true"
							className="h-8 w-48 animate-pulse rounded-sm bg-secondary"
						/>
						<div
							aria-hidden="true"
							className="h-4 w-32 animate-pulse rounded-sm bg-secondary"
						/>
						<div
							aria-hidden="true"
							className="h-64 w-full animate-pulse rounded-md bg-secondary"
						/>
					</div>
				) : detail ? (
					<BookDetail detail={detail} onRefresh={() => void refetchDetail()} />
				) : error ? (
					<ErrorState
						title="Couldn't load audiobooks"
						body="Is the server running?"
						onRetry={() => void refetchBooks()}
					/>
				) : hasBooks ? (
					<EmptyState
						title="Select an audiobook"
						body="Choose a book from the sidebar to see chapters and casting."
					/>
				) : (
					<div className="flex flex-col items-center justify-center py-16 text-center">
						<div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-secondary">
							<BookOpenIcon
								className="size-7 text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
						<h3 className="mb-1 text-sm font-medium text-foreground">
							No audiobooks yet
						</h3>
						<p className="mb-5 max-w-xs text-xs text-muted-foreground">
							Import an EPUB or PDF to get started. Chapters are previewed
							before anything renders.
						</p>
						<div className="flex gap-2">
							<Button size="sm">
								<ArrowUpTrayIcon
									className="mr-1.5 size-3.5"
									aria-hidden="true"
								/>
								Import EPUB / PDF
							</Button>
							<Button size="sm" variant="outline">
								<PencilSquareIcon
									className="mr-1.5 size-3.5"
									aria-hidden="true"
								/>
								Paste text instead
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
