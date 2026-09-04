import { BookOpenIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useAudiobookDetail,
	useAudiobookList,
} from "@/lib/hooks/useAudiobooks";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { BookDetail } from "./BookDetail";
import { BookList } from "./BookList";
import { ImportWizard } from "./ImportWizard";

export function AudiobooksTab() {
	const selectedId = useAudiobookStore((s) => s.selectedId);
	const setSelectedId = useAudiobookStore((s) => s.setSelectedId);

	const {
		data: books = [],
		isLoading: booksLoading,
		error: booksError,
		refetch: refetchBooks,
	} = useAudiobookList();

	const {
		data: detail = null,
		isLoading: detailLoading,
		refetch: refetchDetail,
	} = useAudiobookDetail(selectedId);

	useEffect(() => {
		if (books.length && !selectedId) {
			setSelectedId(books[0].id);
		}
	}, [books, selectedId, setSelectedId]);

	return (
		<div className="flex h-full min-h-0 gap-6 -mx-8 px-8">
			<div className="w-[360px] shrink-0 flex flex-col min-h-0 overflow-hidden">
				<ImportWizard
					onImported={() => {
						refetchBooks();
					}}
				/>
				<BookList
					books={books}
					isLoading={booksLoading}
					error={booksError}
					onRefresh={refetchBooks}
				/>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto pr-2">
				{detailLoading && selectedId ? (
					<div className="flex flex-col gap-4 p-4">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-64 w-full" />
					</div>
				) : detail ? (
					<BookDetail detail={detail} onRefresh={refetchDetail} />
				) : booksError ? (
					<Alert
						variant="destructive"
						message="Couldn't load audiobooks — is the server running?"
						onDismiss={() => refetchBooks()}
					/>
				) : (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<BookOpenIcon className="size-10 text-muted-foreground/30 mb-3" />
						<p className="text-sm text-muted-foreground">
							Select or import an audiobook
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
