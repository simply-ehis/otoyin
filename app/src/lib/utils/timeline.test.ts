import { describe, expect, it } from "vitest";
import { commitMoveResize } from "@/lib/utils/timeline";

describe("commitMoveResize", () => {
	const baseSeg = {
		id: 1,
		start: 0,
		end: 5,
		speaker: "SPEAKER_00",
		original_text: "Hello world",
		translated_text: "Bonjour le monde",
		has_audio: true,
		original_duration: 5,
		speed: 1,
	} as any;

	it("pure move preserves speed and duration", () => {
		const result = commitMoveResize(baseSeg, { start: 2, end: 7 });
		expect(result.start).toBe(2);
		expect(result.end).toBe(7);
		// Move preserves existing speed
		expect(result.speed).toBe(1);
		expect(result.original_duration).toBe(5);
	});

	it("resize to shorter duration computes speed > 1", () => {
		const result = commitMoveResize(baseSeg, { start: 0, end: 2.5 });
		expect(result.start).toBe(0);
		expect(result.end).toBe(2.5);
		expect(result.speed).toBe(2);
		expect(result.original_duration).toBe(5);
	});

	it("resize to longer duration computes speed < 1", () => {
		const result = commitMoveResize(baseSeg, { start: 0, end: 10 });
		expect(result.start).toBe(0);
		expect(result.end).toBe(10);
		expect(result.speed).toBe(0.5);
		expect(result.original_duration).toBe(5);
	});

	it("resize back to speed 1 deletes speed key", () => {
		const seg = { ...baseSeg, speed: 2, original_duration: 10 };
		const result = commitMoveResize(seg, { start: 0, end: 10 });
		expect(result.speed).toBeUndefined();
		expect(result.original_duration).toBe(10);
	});

	it("resize preserves exact end value (clamping done in UI layer)", () => {
		const result = commitMoveResize(baseSeg, { start: 0, end: 0.1 });
		expect(result.start).toBe(0);
		expect(result.end).toBe(0.1);
		expect(result.speed).toBeGreaterThan(1);
	});

	it("move to negative start preserves value (clamping done in UI layer)", () => {
		const result = commitMoveResize(baseSeg, { start: -5, end: 0 });
		expect(result.start).toBe(-5);
		expect(result.end).toBe(0);
		expect(result.speed).toBe(1);
	});
});
