import { describe, expect, it } from "vitest";
import {
	ASSISTANT_WIDTH_CONTENT_FLOOR,
	ASSISTANT_WIDTH_MAX,
	ASSISTANT_WIDTH_MIN,
	clampAssistantWidth,
} from "./assistantWidth";

describe("clampAssistantWidth", () => {
	it("keeps a too-narrow request at the minimum", () => {
		expect(clampAssistantWidth(100, 1920)).toBe(ASSISTANT_WIDTH_MIN);
	});

	it("caps at the hard maximum on ultrawide screens", () => {
		expect(clampAssistantWidth(2000, 3840)).toBe(ASSISTANT_WIDTH_MAX);
	});

	it("shrinks the cap so sidebar + content keep their floor", () => {
		// 1200 - 560 = 640 available before hitting the hard max.
		expect(clampAssistantWidth(900, 1200)).toBe(640);
	});

	it("falls back to the minimum when the window is tiny", () => {
		// 800 - 560 = 240 < MIN, so the floor wins over the content guard.
		expect(clampAssistantWidth(480, 800)).toBe(ASSISTANT_WIDTH_MIN);
		expect(ASSISTANT_WIDTH_CONTENT_FLOOR).toBeGreaterThan(ASSISTANT_WIDTH_MIN);
	});

	it("passes an in-range width through untouched", () => {
		expect(clampAssistantWidth(480, 1440)).toBe(480);
	});
});
