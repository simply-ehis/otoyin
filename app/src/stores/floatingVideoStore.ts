import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FloatingVideoState {
	url: string | null;
	visible: boolean;
	minimized: boolean;
	position: { x: number; y: number };
	size: { width: number; height: number };
	volume: number;
	muted: boolean;
	playbackRate: number;
	currentTime: number;
	duration: number;
	setUrl: (url: string | null) => void;
	show: () => void;
	hide: () => void;
	clear: () => void;
	toggleMinimized: () => void;
	setPosition: (pos: { x: number; y: number }) => void;
	setSize: (size: { width: number; height: number }) => void;
	setVolume: (vol: number) => void;
	setMuted: (muted: boolean) => void;
	setPlaybackRate: (rate: number) => void;
	setTime: (time: number) => void;
	setDuration: (dur: number) => void;
}

const DEFAULT_POS = { x: 24, y: 24 };
const DEFAULT_SIZE = { width: 320, height: 180 };

export const useFloatingVideoStore = create<FloatingVideoState>()(
	persist(
		(set) => ({
			url: null,
			visible: false,
			minimized: false,
			position: DEFAULT_POS,
			size: DEFAULT_SIZE,
			volume: 1,
			muted: false,
			playbackRate: 1,
			currentTime: 0,
			duration: 0,
			setUrl: (url) => set({ url, visible: !!url }),
			show: () => set({ visible: true }),
			hide: () => set({ visible: false }),
			clear: () => set({ url: null, visible: false }),
			toggleMinimized: () => set((state) => ({ minimized: !state.minimized })),
			setPosition: (pos) => set({ position: pos }),
			setSize: (size) => set({ size }),
			setVolume: (vol) => set({ volume: vol }),
			setMuted: (muted) => set({ muted }),
			setPlaybackRate: (rate) => set({ playbackRate: rate }),
			setTime: (time) => set({ currentTime: time }),
			setDuration: (dur) => set({ duration: dur }),
		}),
		{
			name: "otoyin-floating-video",
			partialize: (state) => ({
				position: state.position,
				size: state.size,
				volume: state.volume,
				muted: state.muted,
				playbackRate: state.playbackRate,
			}),
		},
	),
);
