import { useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { StoryItemDetail } from "@/lib/api/types";
import {
	ERR_DESC_GENERATION_FAILED,
	ERR_DESC_STORY_FAILED,
	ERR_TITLE_GENERATION,
	ERR_TITLE_STORY,
	ERR_TITLE_VALIDATION,
} from "@/lib/errorMessages";
import {
	useDuplicateStoryItem,
	useRemoveStoryItem,
	useSetStoryItemVersion,
	useSplitStoryItem,
} from "@/lib/hooks/useStories";
import { useGenerationStore } from "@/stores/generationStore";

interface UseStoryActionsProps {
	storyId: string;
	items: StoryItemDetail[];
	selectedClipId: string | null;
	currentTimeMs: number;
	setSelectedClipId: (id: string | null) => void;
}

function getEffectiveDuration(item: StoryItemDetail) {
	const base =
		item.duration * 1000 - (item.trim_start_ms || 0) - (item.trim_end_ms || 0);
	const speed = item.speed || 1;
	return base / speed;
}

export function useStoryActions({
	storyId,
	items,
	selectedClipId,
	currentTimeMs,
	setSelectedClipId,
}: UseStoryActionsProps) {
	const { toast } = useToast();
	const addPendingGeneration = useGenerationStore(
		(s) => s.addPendingGeneration,
	);
	const splitItem = useSplitStoryItem();
	const duplicateItem = useDuplicateStoryItem();
	const removeItem = useRemoveStoryItem();
	const setItemVersion = useSetStoryItemVersion();

	const handleSplit = useCallback(() => {
		if (!selectedClipId || splitItem.isPending) {
			return;
		}

		const item = items.find((i) => i.id === selectedClipId);
		if (!item) {
			return;
		}

		const splitTimeMs = Math.round(currentTimeMs - item.start_time_ms);
		const effectiveDuration = getEffectiveDuration(item);

		if (splitTimeMs <= 0 || splitTimeMs >= effectiveDuration) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "That split point doesn't land on a valid position",
				variant: "destructive",
			});
			return;
		}

		splitItem.mutate(
			{
				storyId,
				itemId: selectedClipId,
				data: { split_time_ms: splitTimeMs },
			},
			{
				onSuccess: () => {
					setSelectedClipId(null);
				},
				onError: () => {
					toast({
						title: ERR_TITLE_STORY,
						description: ERR_DESC_STORY_FAILED,
						variant: "destructive",
					});
				},
			},
		);
	}, [
		selectedClipId,
		items,
		currentTimeMs,
		storyId,
		splitItem,
		toast,
		setSelectedClipId,
	]);

	const handleDuplicate = useCallback(() => {
		if (!selectedClipId) {
			return;
		}

		duplicateItem.mutate(
			{
				storyId,
				itemId: selectedClipId,
			},
			{
				onError: () => {
					toast({
						title: ERR_TITLE_STORY,
						description: ERR_DESC_STORY_FAILED,
						variant: "destructive",
					});
				},
			},
		);
	}, [selectedClipId, storyId, duplicateItem, toast]);

	const handleDelete = useCallback(() => {
		if (!selectedClipId) {
			return;
		}

		removeItem.mutate(
			{
				storyId,
				itemId: selectedClipId,
			},
			{
				onSuccess: () => {
					setSelectedClipId(null);
				},
				onError: () => {
					toast({
						title: ERR_TITLE_STORY,
						description: ERR_DESC_STORY_FAILED,
						variant: "destructive",
					});
				},
			},
		);
	}, [selectedClipId, storyId, removeItem, toast, setSelectedClipId]);

	const handleRegenerate = useCallback(async () => {
		const selectedItem = selectedClipId
			? items.find((i) => i.id === selectedClipId)
			: undefined;
		if (!selectedItem) {
			return;
		}
		try {
			await apiClient.regenerateGeneration(selectedItem.generation_id);
			addPendingGeneration(selectedItem.generation_id);
		} catch (_error) {
			toast({
				title: ERR_TITLE_GENERATION,
				description: ERR_DESC_GENERATION_FAILED,
				variant: "destructive",
			});
		}
	}, [selectedClipId, items, addPendingGeneration, toast]);

	const handleSetVersion = useCallback(
		(versionId: string | null) => {
			if (!selectedClipId) {
				return;
			}
			setItemVersion.mutate(
				{
					storyId,
					itemId: selectedClipId,
					data: { version_id: versionId },
				},
				{
					onError: () => {
						toast({
							title: ERR_TITLE_STORY,
							description: ERR_DESC_STORY_FAILED,
							variant: "destructive",
						});
					},
				},
			);
		},
		[selectedClipId, storyId, setItemVersion, toast],
	);

	return {
		handleSplit,
		handleDuplicate,
		handleDelete,
		handleRegenerate,
		handleSetVersion,
	};
}
