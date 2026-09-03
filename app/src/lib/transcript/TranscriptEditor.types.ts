import type { WordTimestamp } from "./TranscriptService";

export interface TranscriptEditorProps {
	words: WordTimestamp[];
	loading: boolean;
	error: string | null;
	selectedIndices: Set<number>;
	onSeekWord: (word: WordTimestamp) => Promise<
		| {
				playhead_ms: number;
				select_start_ms: number;
				select_end_ms: number;
				word: string;
		  }
		| undefined
	>;
	onSelect: (index: number, multi: boolean) => void;
	onSelectRange: (start: number, end: number) => void;
}
