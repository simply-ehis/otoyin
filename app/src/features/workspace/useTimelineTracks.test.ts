import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	pixelsPerSecond,
	snapTime,
	useTimelineTracks,
} from "./useTimelineTracks";

describe("snapTime", () => {
	it.each([
		[0, 0],
		[0.5, 1],
		[1.2, 1],
		[1.5, 2],
		[2.3, 2],
		[5.9, 6],
	])("snaps %is to %is", (input, expected) => {
		expect(snapTime(input)).toBe(expected);
	});
});

describe("pixelsPerSecond", () => {
	it("returns 100 px/sec at zoom 1", () => {
		expect(pixelsPerSecond(1)).toBe(100);
	});
	it("scales linearly with zoom", () => {
		expect(pixelsPerSecond(0.5)).toBe(50);
		expect(pixelsPerSecond(2)).toBe(200);
		expect(pixelsPerSecond(3)).toBe(300);
	});
});

describe("useTimelineTracks", () => {
	it("starts with initial tracks and empty undo/redo stacks", () => {
		const initial = [
			{
				id: "a",
				name: "A",
				muted: false,
				solo: false,
				volume: 0.75,
				startTime: 0,
				duration: 5,
			},
			{
				id: "b",
				name: "B",
				muted: false,
				solo: false,
				volume: 0.75,
				startTime: 2,
				duration: 3,
			},
		];
		const { result } = renderHook(() =>
			useTimelineTracks({ initialTracks: initial }),
		);
		expect(result.current.tracks).toHaveLength(2);
		expect(result.current.undoStack).toHaveLength(0);
		expect(result.current.redoStack).toHaveLength(0);
		expect(result.current.snap).toBe(true);
		expect(result.current.zoom).toBe(1);
	});

	it("moveTrackTo pushes undo and updates startTime", () => {
		const { result } = renderHook(() =>
			useTimelineTracks({
				initialTracks: [
					{
						id: "a",
						name: "A",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 0,
						duration: 5,
					},
				],
			}),
		);
		act(() => {
			result.current.moveTrackTo("a", 3);
		});
		expect(result.current.tracks[0].startTime).toBe(3);
		expect(result.current.undoStack).toHaveLength(1);
		expect(result.current.redoStack).toHaveLength(0);
	});

	it("undo reverts the last move", () => {
		const { result } = renderHook(() =>
			useTimelineTracks({
				initialTracks: [
					{
						id: "a",
						name: "A",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 0,
						duration: 5,
					},
				],
			}),
		);
		act(() => {
			result.current.moveTrackTo("a", 3);
		});
		act(() => {
			result.current.undo();
		});
		expect(result.current.tracks[0].startTime).toBe(0);
		expect(result.current.redoStack).toHaveLength(1);
	});

	it("redo restores the undone move", () => {
		const { result } = renderHook(() =>
			useTimelineTracks({
				initialTracks: [
					{
						id: "a",
						name: "A",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 0,
						duration: 5,
					},
				],
			}),
		);
		act(() => {
			result.current.moveTrackTo("a", 3);
		});
		act(() => {
			result.current.undo();
		});
		act(() => {
			result.current.redo();
		});
		expect(result.current.tracks[0].startTime).toBe(3);
		expect(result.current.redoStack).toHaveLength(0);
	});

	it("undo with empty stack is a no-op", () => {
		const { result } = renderHook(() =>
			useTimelineTracks({
				initialTracks: [
					{
						id: "a",
						name: "A",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 0,
						duration: 5,
					},
				],
			}),
		);
		act(() => {
			result.current.undo();
		});
		expect(result.current.tracks[0].startTime).toBe(0);
	});

	it("redo with empty stack is a no-op", () => {
		const { result } = renderHook(() =>
			useTimelineTracks({
				initialTracks: [
					{
						id: "a",
						name: "A",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 0,
						duration: 5,
					},
				],
			}),
		);
		act(() => {
			result.current.redo();
		});
		expect(result.current.tracks[0].startTime).toBe(0);
	});

	it("maxDuration computes furthest track end", () => {
		const { result } = renderHook(() =>
			useTimelineTracks({
				initialTracks: [
					{
						id: "a",
						name: "A",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 0,
						duration: 5,
					},
					{
						id: "b",
						name: "B",
						muted: false,
						solo: false,
						volume: 0.75,
						startTime: 8,
						duration: 4,
					},
				],
			}),
		);
		expect(result.current.maxDuration()).toBe(12);
	});

	it("setSnap toggles snap", () => {
		const { result } = renderHook(() => useTimelineTracks());
		act(() => {
			result.current.setSnap(false);
		});
		expect(result.current.snap).toBe(false);
	});

	it("setZoom updates zoom", () => {
		const { result } = renderHook(() => useTimelineTracks());
		act(() => {
			result.current.setZoom(2);
		});
		expect(result.current.zoom).toBe(2);
	});
});
