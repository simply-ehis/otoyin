import { create } from "zustand";

/**
 * Process-wide clipboard for audio-editing primitives (copy/cut segments).
 * Holds a copied clip's storage path + duration so the Stories "Edit" menu can
 * paste it into the timeline as a new story item.
 */

export interface ClipboardClip {
	storagePath: string;
	filename: string;
	durationS: number;
	label: string;
}

interface ClipboardState {
	clip: ClipboardClip | null;
	setClip: (clip: ClipboardClip | null) => void;
	clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
	clip: null,
	setClip: (clip) => set({ clip }),
	clear: () => set({ clip: null }),
}));
