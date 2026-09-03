import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { EffectConfig } from "@/lib/api/types";
import { useEffectsStore } from "@/stores/effectsStore";

beforeEach(() => {
	useEffectsStore.setState({
		selectedPresetId: null,
		workingChain: [],
		isCreatingNew: false,
	});
});

describe("EffectsStore", () => {
	describe("selectedPresetId", () => {
		it("sets preset and clears isCreatingNew", () => {
			act(() => {
				useEffectsStore.getState().setIsCreatingNew(true);
				useEffectsStore.getState().setSelectedPresetId("preset-1");
			});
			expect(useEffectsStore.getState().selectedPresetId).toBe("preset-1");
			expect(useEffectsStore.getState().isCreatingNew).toBe(false);
		});

		it("clears preset", () => {
			act(() => useEffectsStore.getState().setSelectedPresetId("preset-1"));
			act(() => useEffectsStore.getState().setSelectedPresetId(null));
			expect(useEffectsStore.getState().selectedPresetId).toBeNull();
		});
	});

	describe("isCreatingNew", () => {
		it("sets isCreatingNew and clears selectedPresetId", () => {
			act(() => {
				useEffectsStore.getState().setSelectedPresetId("preset-1");
				useEffectsStore.getState().setIsCreatingNew(true);
			});
			expect(useEffectsStore.getState().isCreatingNew).toBe(true);
			expect(useEffectsStore.getState().selectedPresetId).toBeNull();
		});

		it("clears isCreatingNew without affecting preset", () => {
			act(() => {
				useEffectsStore.getState().setIsCreatingNew(true);
				useEffectsStore.getState().setIsCreatingNew(false);
			});
			expect(useEffectsStore.getState().isCreatingNew).toBe(false);
		});
	});

	describe("workingChain", () => {
		it("sets an effects chain", () => {
			const chain: EffectConfig[] = [
				{ type: "eq", enabled: true, params: { low_gain: 0 } },
				{ type: "reverb", enabled: false, params: { room_size: 0.5 } },
			];
			act(() => useEffectsStore.getState().setWorkingChain(chain));
			expect(useEffectsStore.getState().workingChain).toHaveLength(2);
			expect(useEffectsStore.getState().workingChain[0].type).toBe("eq");
		});

		it("clears chain", () => {
			act(() =>
				useEffectsStore
					.getState()
					.setWorkingChain([{ type: "eq", enabled: true, params: {} }]),
			);
			act(() => useEffectsStore.getState().setWorkingChain([]));
			expect(useEffectsStore.getState().workingChain).toHaveLength(0);
		});
	});
});
