/**
 * Device capabilities store.
 *
 * Fetches hardware info (RAM, VRAM, GPU, CPU) and per-model compatibility
 * verdicts from the backend.  The store is consumed by the Store page to
 * show warning badges on models that are too large for the user's device.
 */

import { create } from "zustand";
import { apiClient } from "@/lib/api/client";
import type { ModelCompatibilityInfo } from "@/lib/api/types";

interface DeviceCapabilitiesStore {
	// Hardware info
	totalRamMb: number;
	availableRamMb: number;
	totalVramMb: number;
	freeVramMb: number;
	gpuName: string | null;
	gpuType: string | null;
	cpuCores: number;
	tier: "low_end" | "mid_range" | "high_end" | null;

	// Per-model compatibility map (model_name → compatibility info)
	modelCompat: Map<string, ModelCompatibilityInfo>;

	// Loading state
	loading: boolean;
	error: string | null;
	lastFetchedAt: number | null;

	// Actions
	fetch: () => Promise<void>;
	getCompatibility: (modelName: string) => ModelCompatibilityInfo | null;
	isCompatible: (modelName: string) => boolean;
}

const CACHE_TTL_MS = 30_000; // 30 seconds

export const useDeviceCapabilitiesStore = create<DeviceCapabilitiesStore>(
	(set, get) => ({
		totalRamMb: 0,
		availableRamMb: 0,
		totalVramMb: 0,
		freeVramMb: 0,
		gpuName: null,
		gpuType: null,
		cpuCores: 0,
		tier: null,
		modelCompat: new Map(),
		loading: false,
		error: null,
		lastFetchedAt: null,

		fetch: async () => {
			const state = get();
			// Skip if recently fetched
			if (
				state.lastFetchedAt &&
				Date.now() - state.lastFetchedAt < CACHE_TTL_MS
			) {
				return;
			}
			if (state.loading) {
				return;
			}

			set({ loading: true, error: null });
			try {
				const resp = await apiClient.getDeviceCapabilities();
				const modelCompat = new Map<string, ModelCompatibilityInfo>();
				for (const m of resp.models) {
					modelCompat.set(m.model_name, m);
				}
				set({
					totalRamMb: resp.total_ram_mb,
					availableRamMb: resp.available_ram_mb,
					totalVramMb: resp.total_vram_mb,
					freeVramMb: resp.free_vram_mb,
					gpuName: resp.gpu_name,
					gpuType: resp.gpu_type,
					cpuCores: resp.cpu_cores,
					tier: resp.tier,
					modelCompat,
					loading: false,
					lastFetchedAt: Date.now(),
				});
			} catch (e) {
				set({ loading: false, error: String(e) });
			}
		},

		getCompatibility: (modelName: string) => {
			return get().modelCompat.get(modelName) ?? null;
		},

		isCompatible: (modelName: string) => {
			const info = get().modelCompat.get(modelName);
			return info?.compatible ?? true; // default to compatible if unknown
		},
	}),
);
