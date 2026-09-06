import type { StoryItemDetail } from "@/lib/api/types";

export interface Mutator<T> {
	mutate: (args: T, opts?: { onError?: (e: unknown) => void }) => void;
}

export interface EditorToolbarProps {
	storyId: string;
	isCurrentlyPlaying: boolean;
	currentTimeMs: number;
	totalDurationMs: number;
	selectedClipId: string | null;
	selectedItem: StoryItemDetail | undefined;
	hasMultipleVersions: boolean;
	activeVersionLabel: string | null;
	selectedItemVersions: import("@/lib/api/types").GenerationVersionResponse[];
	onPlayPause: () => void;
	onStop: () => void;
	onSplit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onRegenerate: () => void;
	onSetVersion: (versionId: string) => void;
	onZoomOut: () => void;
	onZoomIn: () => void;
	items: StoryItemDetail[];
	updateVolume: Mutator<{
		storyId: string;
		itemId: string;
		data: { volume: number };
	}>;
	setFade: Mutator<{
		storyId: string;
		itemId: string;
		data: { fade_in_ms: number; fade_out_ms: number };
	}>;
	setGain: Mutator<{
		storyId: string;
		itemId: string;
		data: { gain_db: number };
	}>;
	setPan: Mutator<{ storyId: string; itemId: string; data: { pan: number } }>;
	setSpeed: Mutator<{
		storyId: string;
		itemId: string;
		data: { speed: number };
	}>;
	mergeItems: Mutator<{
		storyId: string;
		data: { first_item_id: string; second_item_id: string };
	}>;
	crossfadeItems: Mutator<{
		storyId: string;
		itemId: string;
		data: { next_item_id: string; duration_ms: number };
	}>;
	normalizeItem: Mutator<{ storyId: string; itemId: string }>;
	reverseItem: Mutator<{ storyId: string; itemId: string }>;
	removeSilence: Mutator<{ storyId: string; itemId: string }>;
}
