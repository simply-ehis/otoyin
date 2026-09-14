import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGenerationProgressStore } from "@/stores/generationProgressStore";

beforeEach(() => {
	useGenerationProgressStore.setState({ byId: {} });
});

describe("generationProgressStore", () => {
	it("starts empty", () => {
		expect(useGenerationProgressStore.getState().byId).toEqual({});
	});

	it("upsert creates an entry with connecting defaults", () => {
		act(() => {
			useGenerationProgressStore.getState().upsert("gen-1", {});
		});
		const entry = useGenerationProgressStore.getState().byId["gen-1"];
		expect(entry).toMatchObject({
			stage: "connecting",
			chunksReady: 0,
			chunksTotal: 0,
			previewUrl: null,
		});
		expect(entry?.startedAt).toBeLessThanOrEqual(Date.now());
	});

	it("upsert merges patches without resetting startedAt", () => {
		act(() => {
			useGenerationProgressStore.getState().upsert("gen-1", {});
		});
		const startedAt =
			useGenerationProgressStore.getState().byId["gen-1"]?.startedAt;
		act(() => {
			useGenerationProgressStore.getState().upsert("gen-1", {
				stage: "streaming",
				chunksReady: 2,
				chunksTotal: 5,
				previewUrl: "http://x/chunk0",
			});
		});
		const entry = useGenerationProgressStore.getState().byId["gen-1"];
		expect(entry?.stage).toBe("streaming");
		expect(entry?.chunksReady).toBe(2);
		expect(entry?.chunksTotal).toBe(5);
		expect(entry?.previewUrl).toBe("http://x/chunk0");
		expect(entry?.startedAt).toBe(startedAt);
	});

	it("remove drops the entry and keeps others", () => {
		act(() => {
			useGenerationProgressStore.getState().upsert("gen-1", {});
			useGenerationProgressStore.getState().upsert("gen-2", {});
			useGenerationProgressStore.getState().remove("gen-1");
		});
		const byId = useGenerationProgressStore.getState().byId;
		expect(byId["gen-1"]).toBeUndefined();
		expect(byId["gen-2"]).toBeDefined();
	});

	it("remove of an unknown id is a no-op", () => {
		act(() => {
			useGenerationProgressStore.getState().remove("nope");
		});
		expect(useGenerationProgressStore.getState().byId).toEqual({});
	});
});
