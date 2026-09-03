import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGenerationStore } from "@/stores/generationStore";

beforeEach(() => {
	useGenerationStore.setState({
		pendingGenerationIds: new Set(),
		isGenerating: false,
		pendingIdsKey: "",
		activeGenerationId: null,
		pendingStoryAdds: new Map(),
	});
});

describe("GenerationStore", () => {
	describe("addPendingGeneration", () => {
		it("adds a generation ID", () => {
			act(() => useGenerationStore.getState().addPendingGeneration("g1"));
			expect(useGenerationStore.getState().pendingGenerationIds.has("g1")).toBe(
				true,
			);
		});

		it("sets isGenerating to true", () => {
			act(() => useGenerationStore.getState().addPendingGeneration("g1"));
			expect(useGenerationStore.getState().isGenerating).toBe(true);
		});

		it("increments pendingIdsKey", () => {
			act(() => useGenerationStore.getState().addPendingGeneration("g1"));
			const key1 = useGenerationStore.getState().pendingIdsKey;
			act(() => useGenerationStore.getState().addPendingGeneration("g2"));
			const key2 = useGenerationStore.getState().pendingIdsKey;
			expect(key1).not.toBe(key2);
		});

		it("handles duplicate IDs (Set deduplicates)", () => {
			act(() => {
				useGenerationStore.getState().addPendingGeneration("g1");
				useGenerationStore.getState().addPendingGeneration("g1");
			});
			expect(useGenerationStore.getState().pendingGenerationIds.size).toBe(1);
		});
	});

	describe("removePendingGeneration", () => {
		it("removes a generation ID", () => {
			act(() => {
				useGenerationStore.getState().addPendingGeneration("g1");
				useGenerationStore.getState().removePendingGeneration("g1");
			});
			expect(useGenerationStore.getState().pendingGenerationIds.has("g1")).toBe(
				false,
			);
		});

		it("sets isGenerating to false when last one removed", () => {
			act(() => {
				useGenerationStore.getState().addPendingGeneration("g1");
				useGenerationStore.getState().removePendingGeneration("g1");
			});
			expect(useGenerationStore.getState().isGenerating).toBe(false);
		});

		it("keeps isGenerating true when others remain", () => {
			act(() => {
				useGenerationStore.getState().addPendingGeneration("g1");
				useGenerationStore.getState().addPendingGeneration("g2");
				useGenerationStore.getState().removePendingGeneration("g1");
			});
			expect(useGenerationStore.getState().isGenerating).toBe(true);
		});

		it("handles removing non-existent ID gracefully", () => {
			act(() =>
				useGenerationStore.getState().removePendingGeneration("nonexistent"),
			);
			expect(useGenerationStore.getState().isGenerating).toBe(false);
		});
	});

	describe("pendingStoryAdds", () => {
		it("adds a story add mapping", () => {
			act(() => useGenerationStore.getState().addPendingStoryAdd("g1", "s1"));
			expect(useGenerationStore.getState().pendingStoryAdds.get("g1")).toBe(
				"s1",
			);
		});

		it("removes and returns the story ID", () => {
			act(() => useGenerationStore.getState().addPendingStoryAdd("g1", "s1"));
			const storyId = useGenerationStore.getState().removePendingStoryAdd("g1");
			expect(storyId).toBe("s1");
			expect(useGenerationStore.getState().pendingStoryAdds.has("g1")).toBe(
				false,
			);
		});

		it("returns undefined for non-existent key", () => {
			const storyId = useGenerationStore
				.getState()
				.removePendingStoryAdd("nonexistent");
			expect(storyId).toBeUndefined();
		});
	});

	describe("activeGenerationId", () => {
		it("sets and clears active generation", () => {
			act(() => useGenerationStore.getState().setActiveGenerationId("g1"));
			expect(useGenerationStore.getState().activeGenerationId).toBe("g1");
			act(() => useGenerationStore.getState().setActiveGenerationId(null));
			expect(useGenerationStore.getState().activeGenerationId).toBeNull();
		});
	});
});
