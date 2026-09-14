import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PlayerState {
	audioUrl: string | null;
	audioId: string | null;
	profileId: string | null;
	title: string | null;
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	isMuted: boolean;
	/** Listening speed multiplier (0.5–2). Applies to WaveSurfer + fallback. */
	playbackRate: number;
	isLooping: boolean;
	shouldRestart: boolean;
	shouldAutoPlay: boolean;
	onFinish: (() => void) | null;
	masterAnalyser: AnalyserNode | null;

	setAudio: (
		url: string,
		id: string,
		profileId: string | null,
		title?: string,
	) => void;
	setAudioWithAutoPlay: (
		url: string,
		id: string,
		profileId: string | null,
		title?: string,
	) => void;
	setIsPlaying: (playing: boolean) => void;
	setCurrentTime: (time: number) => void;
	setDuration: (duration: number) => void;
	setVolume: (volume: number) => void;
	setIsMuted: (muted: boolean) => void;
	setPlaybackRate: (rate: number) => void;
	toggleLoop: () => void;
	restartCurrentAudio: () => void;
	clearRestartFlag: () => void;
	clearAutoPlayFlag: () => void;
	setOnFinish: (callback: (() => void) | null) => void;
	setMasterAnalyser: (analyser: AnalyserNode | null) => void;
	reset: () => void;
}

/** Listening preferences restored across reloads (never the track itself). */
export interface PlayerPrefs {
	volume: number;
	isMuted: boolean;
	playbackRate: number;
}

export const usePlayerStore = create<PlayerState>()(
	persist<PlayerState, [], [], PlayerPrefs>(
		(set) => ({
	audioUrl: null,
	audioId: null,
	profileId: null,
	title: null,
	isPlaying: false,
	currentTime: 0,
	duration: 0,
	volume: 1,
	isMuted: false,
	playbackRate: 1,
	isLooping: false,
	shouldRestart: false,
	shouldAutoPlay: false,
	onFinish: null,
	masterAnalyser: null,

	setAudio: (url, id, profileId, title) =>
		set({
			audioUrl: url,
			audioId: id,
			profileId: profileId || null,
			title: title || null,
			currentTime: 0,
			isPlaying: false,
			shouldRestart: false,
			shouldAutoPlay: false,
		}),
	setAudioWithAutoPlay: (url, id, profileId, title) =>
		set({
			audioUrl: url,
			audioId: id,
			profileId: profileId || null,
			title: title || null,
			currentTime: 0,
			isPlaying: false,
			shouldRestart: false,
			shouldAutoPlay: true,
		}),
	setIsPlaying: (playing) => set({ isPlaying: playing }),
	setCurrentTime: (time) => set({ currentTime: time }),
	setDuration: (duration) => set({ duration }),
	setVolume: (volume) => set({ volume }),
	setIsMuted: (muted) => set({ isMuted: muted }),
	setPlaybackRate: (rate) =>
		set({ playbackRate: Math.min(2, Math.max(0.5, rate)) }),
	toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
	restartCurrentAudio: () => set({ shouldRestart: true }),
	clearRestartFlag: () => set({ shouldRestart: false }),
	clearAutoPlayFlag: () => set({ shouldAutoPlay: false }),
	setOnFinish: (callback) => set({ onFinish: callback }),
	setMasterAnalyser: (analyser) => set({ masterAnalyser: analyser }),
	reset: () =>
		set({
			audioUrl: null,
			audioId: null,
			profileId: null,
			title: null,
			isPlaying: false,
			currentTime: 0,
			duration: 0,
			isMuted: false,
			isLooping: false,
			shouldRestart: false,
			shouldAutoPlay: false,
			onFinish: null,
			masterAnalyser: null,
		}),
		}),
		{
			name: "otoyin-player",
			// Persist listening preferences only — never the current track or
			// transient playback state (a reload must not resurrect audio).
			partialize: (s) => ({
				volume: s.volume,
				isMuted: s.isMuted,
				playbackRate: s.playbackRate,
			}),
		},
	),
);
