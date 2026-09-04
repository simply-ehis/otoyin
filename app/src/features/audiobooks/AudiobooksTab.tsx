import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/ui/primitives";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ErrorState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import {
	useAudiobookDetail,
	useAudiobookList,
	useDeleteAudiobook,
} from "@/lib/hooks/useAudiobooks";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { BookDetail } from "./BookDetail";
import { ImportWizard } from "./ImportWizard";

/**
 * Audiobooks: EPUB/PDF import with chapter preview, per-book voice
 * cast, chapter render queue, WAV/.m4b export, format conversion.
 */
export function AudiobooksTab() {
	const selectedId = useAudiobookStore((s) => s.selectedId);
	const setSelectedId = useAudiobookStore((s) => s.setSelectedId);
	const { data: books = [], isLoading, error, refetch: refetchBooks } = useAudiobookList();
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
						<div aria-hidden="true" className="h-8 w-48 animate-pulse rounded-sm bg-secondary" />
						<div aria-hidden="true" className="h-4 w-32 animate-pulse rounded-sm bg-secondary" />
						<div aria-hidden="true" className="h-64 w-full animate-pulse rounded-md bg-secondary" />
					</div>
				) : detail ? (
					<BookDetail detail={detail} onRefresh={() => void refetchDetail()} />
				) : error ? (
					<ErrorState
						title="Couldn't load audiobooks"
						body="Is the server running?"
						onRetry={() => void refetchBooks()}
					/>
				) : (
					<EmptyState
						title="Select or import an audiobook"
						body="EPUB or PDF — chapters preview before anything renders."
					/>
				)}
			</div>
		</div>
	);
}
