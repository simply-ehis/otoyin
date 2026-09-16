import { create } from "zustand";

export type GenerationStage =
	| "connecting"
	| "loading_model"
	| "generating"
	| "streaming";

export interface GenerationProgress {
	stage: GenerationStage;
	startedAt: number;
	chunksReady: number;
	chunksTotal: number;
	/** Latest streamable chunk URL (playable before assembly finishes). */
	previewUrl: string | null;
}

interface GenerationProgressState {
	byId: Record<string, GenerationProgress>;
	upsert: (id: string, patch: Partial<GenerationProgress>) => void;
	remove: (id: string) => void;
}

export const useGenerationProgressStore = create<GenerationProgressState>(
	(set) => ({
		byId: {},

		upsert: (id, patch) =>
			set((state) => {
				const prev = state.byId[id];
				const now = Date.now();
				return {
					byId: {
						...state.byId,
						[id]: {
							stage: patch.stage ?? prev?.stage ?? "connecting",
							startedAt: patch.startedAt ?? prev?.startedAt ?? now,
							chunksReady: patch.chunksReady ?? prev?.chunksReady ?? 0,
							chunksTotal: patch.chunksTotal ?? prev?.chunksTotal ?? 0,
							previewUrl:
								patch.previewUrl !== undefined
									? patch.previewUrl
									: (prev?.previewUrl ?? null),
						},
					},
				};
			}),

		remove: (id) =>
			set((state) => {
				if (!(id in state.byId)) {
					return state;
				}
				const next = { ...state.byId };
				delete next[id];
				return { byId: next };
			}),
	}),
);
