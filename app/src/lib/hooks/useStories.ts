import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type {
	StoryCreate,
	StoryItemBatchUpdate,
	StoryItemCreate,
	StoryItemCrossfade,
	StoryItemMerge,
	StoryItemMove,
	StoryItemMoveToStory,
	StoryItemReorder,
	StoryItemSpeed,
	StoryItemSplit,
	StoryItemTrim,
	StoryItemVersionUpdate,
	StoryItemVolumeUpdate,
	StoryMatchLoudness,
} from "@/lib/api/types";
import { usePlatform } from "@/platform/PlatformContext";

export function useStories() {
	return useQuery({
		queryKey: ["stories"],
		queryFn: () => apiClient.listStories(),
	});
}

export function useStory(storyId: string | null) {
	return useQuery({
		queryKey: ["stories", storyId],
		queryFn: () => {
			if (!storyId) {
				throw new Error("storyId is required to fetch a story");
			}
			return apiClient.getStory(storyId);
		},
		enabled: !!storyId,
	});
}

export function useCreateStory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: StoryCreate) => apiClient.createStory(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
		},
	});
}

export function useUpdateStory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ storyId, data }: { storyId: string; data: StoryCreate }) =>
			apiClient.updateStory(storyId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useDeleteStory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (storyId: string) => apiClient.deleteStory(storyId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
		},
	});
}

export function useAddStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			data,
		}: {
			storyId: string;
			data: StoryItemCreate;
		}) => apiClient.addStoryItem(storyId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useRemoveStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ storyId, itemId }: { storyId: string; itemId: string }) =>
			apiClient.removeStoryItem(storyId, itemId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useUpdateStoryItemTimes() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			data,
		}: {
			storyId: string;
			data: StoryItemBatchUpdate;
		}) => apiClient.updateStoryItemTimes(storyId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useReorderStoryItems() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			data,
		}: {
			storyId: string;
			data: StoryItemReorder;
		}) => apiClient.reorderStoryItems(storyId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useMoveStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemMove;
		}) => apiClient.moveStoryItem(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useTrimStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemTrim;
		}) => apiClient.trimStoryItem(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useUpdateStoryItemVolume() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemVolumeUpdate;
		}) => apiClient.updateStoryItemVolume(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useSplitStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemSplit;
		}) => apiClient.splitStoryItem(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useDuplicateStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ storyId, itemId }: { storyId: string; itemId: string }) =>
			apiClient.duplicateStoryItem(storyId, itemId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useSetStoryItemVersion() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemVersionUpdate;
		}) => apiClient.setStoryItemVersion(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useExportStoryAudio() {
	const platform = usePlatform();

	return useMutation({
		mutationFn: async ({
			storyId,
			storyName,
		}: {
			storyId: string;
			storyName: string;
		}) => {
			const blob = await apiClient.exportStoryAudio(storyId);

			// Create safe filename
			const safeName = storyName
				.substring(0, 50)
				.replace(/[^a-z0-9]/gi, "-")
				.toLowerCase();
			const filename = `${safeName || "story"}.wav`;

			await platform.filesystem.saveFile(filename, blob, [
				{
					name: "Audio File",
					extensions: ["wav"],
				},
			]);

			return blob;
		},
	});
}

export function useSetStoryItemFade() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: { fade_in_ms: number; fade_out_ms: number };
		}) => apiClient.setStoryItemFade(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useSetStoryItemGain() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: { gain_db: number };
		}) => apiClient.setStoryItemGain(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useSetStoryItemPan() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: { pan: number };
		}) => apiClient.setStoryItemPan(storyId, itemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useNormalizeStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			targetLufs,
		}: {
			storyId: string;
			itemId: string;
			targetLufs?: number;
		}) =>
			apiClient.normalizeStoryItem(storyId, itemId, {
				target_lufs: targetLufs ?? -14.0,
			}),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useReverseStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ storyId, itemId }: { storyId: string; itemId: string }) =>
			apiClient.reverseStoryItem(storyId, itemId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

export function useRemoveSilenceFromStoryItem() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ storyId, itemId }: { storyId: string; itemId: string }) =>
			apiClient.removeSilenceFromStoryItem(storyId, itemId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({
				queryKey: ["stories", variables.storyId],
			});
		},
	});
}

function invalidateStory(
	queryClient: ReturnType<typeof useQueryClient>,
	storyId: string,
) {
	queryClient.invalidateQueries({ queryKey: ["stories"] });
	queryClient.invalidateQueries({ queryKey: ["stories", storyId] });
	queryClient.invalidateQueries({ queryKey: ["story-history-depth", storyId] });
}

export function useMergeStoryItems() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			data,
		}: {
			storyId: string;
			data: StoryItemMerge;
		}) => apiClient.mergeStoryItems(storyId, data),
		onSuccess: (_, variables) =>
			invalidateStory(queryClient, variables.storyId),
	});
}

export function useSetStoryItemSpeed() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemSpeed;
		}) => apiClient.setStoryItemSpeed(storyId, itemId, data),
		onSuccess: (_, variables) =>
			invalidateStory(queryClient, variables.storyId),
	});
}

export function useMatchStoryLoudness() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			data,
		}: {
			storyId: string;
			data: StoryMatchLoudness;
		}) => apiClient.matchStoryLoudness(storyId, data),
		onSuccess: (_, variables) =>
			invalidateStory(queryClient, variables.storyId),
	});
}

export function useCrossfadeStoryItems() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemCrossfade;
		}) => apiClient.crossfadeStoryItems(storyId, itemId, data),
		onSuccess: (_, variables) =>
			invalidateStory(queryClient, variables.storyId),
	});
}

export function useMoveStoryItemToStory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			storyId,
			itemId,
			data,
		}: {
			storyId: string;
			itemId: string;
			data: StoryItemMoveToStory;
		}) => apiClient.moveStoryItemToStory(storyId, itemId, data),
		onSuccess: (_, variables) => {
			invalidateStory(queryClient, variables.storyId);
			invalidateStory(queryClient, variables.data.target_story_id);
		},
	});
}

export function useStoryHistoryDepth(storyId: string | null) {
	return useQuery({
		queryKey: ["story-history-depth", storyId],
		queryFn: () => {
			if (!storyId) {
				throw new Error("storyId is required");
			}
			return apiClient.storyHistoryDepth(storyId);
		},
		enabled: !!storyId,
		staleTime: 5_000,
	});
}

export function useUndoStoryEdit() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (storyId: string) => apiClient.undoStoryEdit(storyId),
		onSuccess: (_, storyId) => invalidateStory(queryClient, storyId),
	});
}

export function useRedoStoryEdit() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (storyId: string) => apiClient.redoStoryEdit(storyId),
		onSuccess: (_, storyId) => invalidateStory(queryClient, storyId),
	});
}
