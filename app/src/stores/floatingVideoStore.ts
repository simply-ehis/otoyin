import { create } from "zustand";

interface FloatingVideoState {
	url: string | null;
	visible: boolean;
	setUrl: (url: string | null) => void;
	show: () => void;
	hide: () => void;
	clear: () => void;
}

export const useFloatingVideoStore = create<FloatingVideoState>((set) => ({
	url: null,
	visible: false,
	setUrl: (url) => set({ url, visible: !!url }),
	show: () => set({ visible: true }),
	hide: () => set({ visible: false }),
	clear: () => set({ url: null, visible: false }),
}));