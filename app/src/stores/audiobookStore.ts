import { create } from "zustand";

interface AudiobookStore {
	selectedId: string | null;
	setSelectedId: (id: string | null) => void;
}
export const useAudiobookStore = create<AudiobookStore>((set) => ({
	selectedId: null,
	setSelectedId: (id) => set({ selectedId: id }),
}));
