import { useCallback, useEffect, useState } from "react";
import { transcriptService, type WordTimestamp } from "./TranscriptService";

export interface TranscriptEditorState {
	words: WordTimestamp[];
	loading: boolean;
	error: string | null;
	selectedIndices: Set<number>;
}

export function useTranscriptEditor(generationId: string | null) {
	const [state, setState] = useState<TranscriptEditorState>({
		words: [],
		loading: false,
		error: null,
		selectedIndices: new Set(),
	});

	const fetch = useCallback(async () => {
		if (!generationId) {
			return;
		}
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const words = await transcriptService.fetchWords(generationId);
			setState((s) => ({ ...s, words, loading: false }));
		} catch (e) {
			setState((s) => ({
				...s,
				loading: false,
				error: e instanceof Error ? e.message : "Failed to load transcript",
			}));
		}
	}, [generationId]);

	useEffect(() => {
		fetch();
	}, [fetch]);

	const handleClickWord = useCallback(
		async (word: WordTimestamp) => {
			if (!generationId) {
				return;
			}
			try {
				const result = await transcriptService.clickWord(generationId, word);
				return result;
			} catch (e) {
				console.error("Failed to seek:", e);
			}
		},
		[generationId],
	);

	const handleDeleteWords = useCallback(
		async (wordIndices: number[], crossfadeMs = 10) => {
			if (!generationId) {
				return;
			}
			setState((s) => ({ ...s, loading: true, error: null }));
			try {
				const result = await transcriptService.deleteWords(
					generationId,
					wordIndices,
					crossfadeMs,
				);
				setState((s) => ({
					...s,
					words: [],
					loading: false,
					selectedIndices: new Set(),
				}));
				return result;
			} catch (e) {
				setState((s) => ({
					...s,
					loading: false,
					error: e instanceof Error ? e.message : "Failed to delete words",
				}));
				throw e;
			}
		},
		[generationId],
	);

	const toggleSelect = useCallback((index: number, multi = false) => {
		setState((s) => {
			const newSelection = new Set(s.selectedIndices);
			if (multi) {
				if (newSelection.has(index)) {
					newSelection.delete(index);
				} else {
					newSelection.add(index);
				}
			} else {
				newSelection.clear();
				newSelection.add(index);
			}
			return { ...s, selectedIndices: newSelection };
		});
	}, []);

	const selectRange = useCallback((start: number, end: number) => {
		setState((s) => {
			const newSelection = new Set(s.selectedIndices);
			const min = Math.min(start, end);
			const max = Math.max(start, end);
			for (let i = min; i <= max; i++) {
				newSelection.add(i);
			}
			return { ...s, selectedIndices: newSelection };
		});
	}, []);

	const clearSelection = useCallback(() => {
		setState((s) => ({ ...s, selectedIndices: new Set() }));
	}, []);

	return {
		...state,
		fetch,
		handleClickWord,
		handleDeleteWords,
		toggleSelect,
		selectRange,
		clearSelection,
	};
}
