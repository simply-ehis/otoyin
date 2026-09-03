import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoryItemDetail } from "@/lib/api/types";
import { useStoryStore } from "@/stores/storyStore";

function makeStoryItem(
	overrides: Partial<StoryItemDetail> = {},
): StoryItemDetail {
	return {
		id: "test-item",
		story_id: "test-story",
		generation_id: "test-gen",
		version_id: "test-ver",
		start_time_ms: 0,
		track: 0,
		trim_start_ms: 0,
		trim_end_ms: 0,
		created_at: new Date().toISOString(),
		profile_id: "test-profile",
		profile_name: "Test Profile",
		text: "Test text",
		language: "en",
		audio_path: "/test/audio.wav",
		duration: 1000,
		seed: 42,
		instruct: undefined,
		engine: undefined,
		volume: 1,
		fade_in_ms: 0,
		fade_out_ms: 0,
		gain_db: 0,
		pan: 0,
		generation_created_at: new Date().toISOString(),
		versions: [],
		active_version_id: undefined,
		...overrides,
	};
}

beforeEach(() => {
	useStoryStore.setState({
		trackConfigs: {},
		automationLanes: {},
		showAutomation: false,
		selectedAutomationParam: null,
		isPlaying: false,
		currentTimeMs: 0,
		totalDurationMs: 0,
		playbackStoryId: null,
		playbackItems: null,
	});
});

describe("StoryStore — track configs (mute/solo)", () => {
	describe("toggleTrackMute", () => {
		it("mutes a fresh track", () => {
			act(() => useStoryStore.getState().toggleTrackMute(0));
			expect(useStoryStore.getState().trackConfigs[0]?.muted).toBe(true);
		});

		it("unmutes a muted track", () => {
			act(() => useStoryStore.getState().toggleTrackMute(0));
			act(() => useStoryStore.getState().toggleTrackMute(0));
			expect(useStoryStore.getState().trackConfigs[0]?.muted).toBe(false);
		});

		it("preserves solo state when toggling mute", () => {
			act(() => useStoryStore.getState().toggleTrackSolo(0));
			act(() => useStoryStore.getState().toggleTrackMute(0));
			expect(useStoryStore.getState().trackConfigs[0]?.muted).toBe(true);
			expect(useStoryStore.getState().trackConfigs[0]?.solo).toBe(true);
		});

		it("independent tracks don't affect each other", () => {
			act(() => useStoryStore.getState().toggleTrackMute(0));
			expect(useStoryStore.getState().trackConfigs[1]?.muted).toBeUndefined();
		});
	});

	describe("toggleTrackSolo", () => {
		it("solos a fresh track", () => {
			act(() => useStoryStore.getState().toggleTrackSolo(1));
			expect(useStoryStore.getState().trackConfigs[1]?.solo).toBe(true);
		});

		it("unsolos a soloed track", () => {
			act(() => useStoryStore.getState().toggleTrackSolo(1));
			act(() => useStoryStore.getState().toggleTrackSolo(1));
			expect(useStoryStore.getState().trackConfigs[1]?.solo).toBe(false);
		});

		it("preserves mute state when toggling solo", () => {
			act(() => useStoryStore.getState().toggleTrackMute(0));
			act(() => useStoryStore.getState().toggleTrackSolo(0));
			expect(useStoryStore.getState().trackConfigs[0]?.muted).toBe(true);
			expect(useStoryStore.getState().trackConfigs[0]?.solo).toBe(true);
		});
	});
});

describe("StoryStore — automation lanes", () => {
	describe("addAutomationPoint", () => {
		it("creates a new lane when none exists", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.8),
			);
			const lanes = useStoryStore.getState().automationLanes[0];
			expect(lanes).toHaveLength(1);
			expect(lanes[0].parameter).toBe("volume");
			expect(lanes[0].points).toEqual([{ timeMs: 100, value: 0.8 }]);
		});

		it("adds to existing lane", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.8),
			);
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 50, 0.5),
			);
			const points = useStoryStore.getState().automationLanes[0][0].points;
			expect(points).toHaveLength(2);
		});

		it("sorts points by timeMs", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 200, 1.0),
			);
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 50, 0.2),
			);
			const points = useStoryStore.getState().automationLanes[0][0].points;
			expect(points[0].timeMs).toBe(50);
			expect(points[1].timeMs).toBe(200);
		});

		it("keeps separate lanes for different parameters", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.5),
			);
			act(() => useStoryStore.getState().addAutomationPoint(0, "pan", 100, 0));
			expect(useStoryStore.getState().automationLanes[0]).toHaveLength(2);
		});
	});

	describe("moveAutomationPoint", () => {
		it("updates point values", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.5),
			);
			act(() =>
				useStoryStore.getState().moveAutomationPoint(0, "volume", 0, 200, 0.9),
			);
			const point = useStoryStore.getState().automationLanes[0][0].points[0];
			expect(point.timeMs).toBe(200);
			expect(point.value).toBe(0.9);
		});

		it("re-sorts after move", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.5),
			);
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 200, 0.8),
			);
			// Move second point before first
			act(() =>
				useStoryStore.getState().moveAutomationPoint(0, "volume", 1, 50, 0.3),
			);
			const points = useStoryStore.getState().automationLanes[0][0].points;
			expect(points[0].timeMs).toBe(50);
			expect(points[1].timeMs).toBe(100);
		});
	});

	describe("removeAutomationPoint", () => {
		it("removes a point by index", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.5),
			);
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 200, 0.8),
			);
			act(() => useStoryStore.getState().removeAutomationPoint(0, "volume", 0));
			const points = useStoryStore.getState().automationLanes[0][0].points;
			expect(points).toHaveLength(1);
			expect(points[0].timeMs).toBe(200);
		});

		it("removes entire lane when last point is removed", () => {
			act(() =>
				useStoryStore.getState().addAutomationPoint(0, "volume", 100, 0.5),
			);
			act(() => useStoryStore.getState().removeAutomationPoint(0, "volume", 0));
			// Lane is replaced with empty array (key persists)
			expect(useStoryStore.getState().automationLanes[0]).toEqual([]);
		});
	});
});

describe("StoryStore — playback", () => {
	it("play sets playback state", () => {
		const items = [
			makeStoryItem({
				id: "c1",
				duration: 5000,
				start_time_ms: 0,
				story_id: "s1",
			}),
		];
		act(() => useStoryStore.getState().play("s1", items));
		const s = useStoryStore.getState();
		expect(s.isPlaying).toBe(true);
		expect(s.playbackStoryId).toBe("s1");
		expect(s.playbackItems).toEqual(items);
	});

	it("pause stops playing", () => {
		act(() => useStoryStore.getState().play("s1", []));
		act(() => useStoryStore.getState().pause());
		expect(useStoryStore.getState().isPlaying).toBe(false);
	});

	it("seek updates currentTimeMs (clamped to totalDurationMs)", () => {
		act(() => useStoryStore.setState({ totalDurationMs: 10000 }));
		act(() => useStoryStore.getState().seek(3500));
		expect(useStoryStore.getState().currentTimeMs).toBe(3500);
	});

	it("setActiveStory without playing", () => {
		const items = [
			makeStoryItem({
				id: "c1",
				duration: 3000,
				start_time_ms: 0,
				story_id: "s2",
			}),
		];
		act(() => useStoryStore.getState().setActiveStory("s2", items, 3000));
		const s = useStoryStore.getState();
		expect(s.isPlaying).toBe(false);
		expect(s.playbackStoryId).toBe("s2");
		expect(s.totalDurationMs).toBe(3000);
	});
});
