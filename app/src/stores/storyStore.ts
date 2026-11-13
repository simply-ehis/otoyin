import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoryItemDetail } from "@/lib/api/types";

export type AutomationParam = string;

interface TrackConfig {
	muted: boolean;
	solo: boolean;
}

export interface AutomationPoint {
	timeMs: number;
	value: number;
}

export interface AutomationLane {
	parameter: string;
	points: AutomationPoint[];
}

interface StoryPlaybackState {
	// Selection
	selectedStoryId: string | null;
	setSelectedStoryId: (id: string | null) => void;
	selectedClipId: string | null;
	setSelectedClipId: (id: string | null) => void;

	// Track editor UI state
	trackEditorHeight: number;
	setTrackEditorHeight: (height: number) => void;

	// Per-track mute/solo (keyed by track number as string)
	trackConfigs: Record<number, TrackConfig>;
	toggleTrackMute: (track: number) => void;
	toggleTrackSolo: (track: number) => void;

	// Automation lanes (keyed by track number)
	automationLanes: Record<number, AutomationLane[]>;
	showAutomation: boolean;
	setShowAutomation: (show: boolean) => void;
	selectedAutomationParam: string | null;
	setSelectedAutomationParam: (param: string | null) => void;
	addAutomationPoint: (
		track: number,
		param: string,
		timeMs: number,
		value: number,
	) => void;
	moveAutomationPoint: (
		track: number,
		param: string,
		pointIndex: number,
		timeMs: number,
		value: number,
	) => void;
	removeAutomationPoint: (
		track: number,
		param: string,
		pointIndex: number,
	) => void;

	// Playback state
	isPlaying: boolean;
	currentTimeMs: number;
	totalDurationMs: number;
	playbackStoryId: string | null;
	playbackItems: StoryItemDetail[] | null;
	// Web Audio API timing (null when not playing)
	playbackStartContextTime: number | null; // AudioContext.currentTime when playback started
	playbackStartStoryTime: number | null; // Story time (ms) when playback started

	// Actions
	play: (storyId: string, items: StoryItemDetail[]) => void;
	pause: () => void;
	stop: () => void;
	seek: (timeMs: number) => void;
	setPlaybackTiming: (contextTime: number, storyTime: number) => void; // Set timing anchors for Web Audio API
	setActiveStory: (
		storyId: string,
		items: StoryItemDetail[],
		totalDurationMs: number,
	) => void; // Activate story for seeking without playing
}

const DEFAULT_TRACK_EDITOR_HEIGHT = 250;

/**
 * Presentation state survives a reload — you re-open to the story you were
 * editing, with the same heights, track mutes, automation lanes and playhead.
 * Playback toggle itself is never persisted (no surprise playback on open).
 */
export const useStoryStore = create<StoryPlaybackState>()(
	persist<
		StoryPlaybackState,
		[],
		[],
		Pick<
			StoryPlaybackState,
			| "selectedStoryId"
			| "selectedClipId"
			| "trackEditorHeight"
			| "trackConfigs"
			| "automationLanes"
			| "showAutomation"
			| "selectedAutomationParam"
		>
	>(
		(set, get) => ({
			// Selection
			selectedStoryId: null,
			setSelectedStoryId: (id) => set({ selectedStoryId: id }),
			selectedClipId: null,
			setSelectedClipId: (id) => set({ selectedClipId: id }),

			// Track editor UI state
			trackEditorHeight: DEFAULT_TRACK_EDITOR_HEIGHT,
			setTrackEditorHeight: (height) => set({ trackEditorHeight: height }),

			// Per-track mute/solo
			trackConfigs: {},
			toggleTrackMute: (track) =>
				set((state) => {
					const current = state.trackConfigs[track] ?? {
						muted: false,
						solo: false,
					};
					return {
						trackConfigs: {
							...state.trackConfigs,
							[track]: { ...current, muted: !current.muted },
						},
					};
				}),
			toggleTrackSolo: (track) =>
				set((state) => {
					const current = state.trackConfigs[track] ?? {
						muted: false,
						solo: false,
					};
					return {
						trackConfigs: {
							...state.trackConfigs,
							[track]: { ...current, solo: !current.solo },
						},
					};
				}),

			// Automation lanes
			automationLanes: {},
			showAutomation: false,
			setShowAutomation: (show) => set({ showAutomation: show }),
			selectedAutomationParam: null,
			setSelectedAutomationParam: (param) =>
				set({ selectedAutomationParam: param }),
			addAutomationPoint: (track, param, timeMs, value) =>
				set((state) => {
					const lanes = state.automationLanes[track] ?? [];
					const lane = lanes.find((l) => l.parameter === param);
					let newLanes: AutomationLane[];
					if (lane) {
						const newPoints = [...lane.points, { timeMs, value }].sort(
							(a, b) => a.timeMs - b.timeMs,
						);
						newLanes = lanes.map((l) =>
							l.parameter === param ? { ...l, points: newPoints } : l,
						);
					} else {
						newLanes = [
							...lanes,
							{ parameter: param, points: [{ timeMs, value }] },
						];
					}
					return {
						automationLanes: { ...state.automationLanes, [track]: newLanes },
					};
				}),
			moveAutomationPoint: (track, param, pointIndex, timeMs, value) =>
				set((state) => {
					const lanes = state.automationLanes[track] ?? [];
					const lane = lanes.find((l) => l.parameter === param);
					if (!lane) {
						return state;
					}
					const newPoints = lane.points.map((p, i) =>
						i === pointIndex ? { timeMs, value } : p,
					);
					const sorted = [...newPoints].sort((a, b) => a.timeMs - b.timeMs);
					return {
						automationLanes: {
							...state.automationLanes,
							[track]: lanes.map((l) =>
								l.parameter === param ? { ...l, points: sorted } : l,
							),
						},
					};
				}),
			removeAutomationPoint: (track, param, pointIndex) =>
				set((state) => {
					const lanes = state.automationLanes[track] ?? [];
					const lane = lanes.find((l) => l.parameter === param);
					if (!lane) {
						return state;
					}
					const newPoints = lane.points.filter((_, i) => i !== pointIndex);
					const newLanes =
						newPoints.length === 0
							? lanes.filter((l) => l.parameter !== param)
							: lanes.map((l) =>
									l.parameter === param ? { ...l, points: newPoints } : l,
								);
					return {
						automationLanes: { ...state.automationLanes, [track]: newLanes },
					};
				}),

			// Playback state
			isPlaying: false,
			currentTimeMs: 0,
			totalDurationMs: 0,
			playbackStoryId: null,
			playbackItems: null,
			playbackStartContextTime: null,
			playbackStartStoryTime: null,

			// Actions
			play: (storyId, items) => {
				// Calculate total duration from items (accounting for trim + speed)
				const maxEndTimeMs = Math.max(
					...items.map(
						(item) =>
							item.start_time_ms +
							(item.duration * 1000 -
								(item.trim_start_ms || 0) -
								(item.trim_end_ms || 0)) /
								(item.speed || 1),
					),
					0,
				);

				// Find the minimum start time (first item)
				const minStartTimeMs = Math.min(
					...items.map((item) => item.start_time_ms),
					0,
				);

				// If resuming the same story, keep position; otherwise start at first item
				const currentState = get();
				const shouldResume =
					currentState.playbackStoryId === storyId &&
					currentState.currentTimeMs > 0;
				const startTimeMs = shouldResume
					? currentState.currentTimeMs
					: minStartTimeMs;

				set({
					isPlaying: true,
					playbackStoryId: storyId,
					playbackItems: items,
					totalDurationMs: maxEndTimeMs,
					currentTimeMs: startTimeMs,
					// Reset timing anchors - will be set fresh by the playback hook
					playbackStartContextTime: null,
					playbackStartStoryTime: null,
				});
			},

			pause: () => {
				set({
					isPlaying: false,
					// Keep timing anchors so we can resume from same position
				});
			},

			stop: () => {
				set({
					isPlaying: false,
					currentTimeMs: 0,
					playbackStoryId: null,
					playbackItems: null,
					totalDurationMs: 0,
					playbackStartContextTime: null,
					playbackStartStoryTime: null,
				});
			},

			seek: (timeMs) => {
				const state = get();
				const clampedTime = Math.max(
					0,
					Math.min(timeMs, state.totalDurationMs),
				);
				set({
					currentTimeMs: clampedTime,
					// Reset timing anchors - will be set by hook when playback resumes
					playbackStartContextTime: null,
					playbackStartStoryTime: null,
				});
			},

			setPlaybackTiming: (contextTime, storyTime) => {
				set({
					playbackStartContextTime: contextTime,
					playbackStartStoryTime: storyTime,
				});
			},

			setActiveStory: (storyId, items, totalDurationMs) => {
				const currentState = get();
				// Only update if switching to a different story
				if (currentState.playbackStoryId !== storyId) {
					set({
						playbackStoryId: storyId,
						playbackItems: items,
						totalDurationMs,
						currentTimeMs: 0,
						isPlaying: false,
					});
				}
			},
		}),
		{
			name: "otoyin-story",
			version: 1,
			partialize: (s) => ({
				selectedStoryId: s.selectedStoryId,
				selectedClipId: s.selectedClipId,
				trackEditorHeight: s.trackEditorHeight,
				trackConfigs: s.trackConfigs,
				automationLanes: s.automationLanes,
				showAutomation: s.showAutomation,
				selectedAutomationParam: s.selectedAutomationParam,
			}),
		},
	),
);
