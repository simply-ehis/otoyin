import type { UseMutationResult } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Toast } from "@/components/ui/use-toast";
import type {
	StoryItemBatchUpdate,
	StoryItemDetail,
	StoryItemMove,
} from "@/lib/api/types";
import { ERR_DESC_STORY_FAILED, ERR_TITLE_STORY } from "@/lib/errorMessages";
import { LABEL_COL_WIDTH, TIME_RULER_HEIGHT, TRACK_HEIGHT } from "./timeline";

type MoveItemMutation = UseMutationResult<
	unknown,
	Error,
	{ storyId: string; itemId: string; data: StoryItemMove },
	unknown
>;
type BatchUpdateTimesMutation = UseMutationResult<
	unknown,
	Error,
	{ storyId: string; data: StoryItemBatchUpdate },
	unknown
>;

interface UseEditorDragOptions {
	tracksRef: React.RefObject<HTMLDivElement | null>;
	items: StoryItemDetail[];
	tracks: number[];
	pixelsToMs: (px: number) => number;
	storyId: string;
	moveItem: MoveItemMutation;
	batchUpdateTimes: BatchUpdateTimesMutation;
	toast: (vars: Toast) => void;
}

export function useEditorDrag({
	tracksRef,
	items,
	tracks,
	pixelsToMs,
	storyId,
	moveItem,
	batchUpdateTimes,
	toast,
}: UseEditorDragOptions) {
	const [draggingItem, setDraggingItem] = useState<string | null>(null);
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
	const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

	const handleDragStart = useCallback(
		(e: React.MouseEvent, item: StoryItemDetail) => {
			e.stopPropagation();
			if (!tracksRef.current) {
				return;
			}

			const rect = e.currentTarget.getBoundingClientRect();
			setDragOffset({
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			});
			setDragPosition({
				x:
					rect.left -
					tracksRef.current.getBoundingClientRect().left +
					tracksRef.current.scrollLeft -
					LABEL_COL_WIDTH,
				y:
					rect.top -
					tracksRef.current.getBoundingClientRect().top -
					TIME_RULER_HEIGHT,
			});
			setDraggingItem(item.id);
		},
		[tracksRef],
	);

	const handleDragMove = useCallback(
		(e: React.MouseEvent) => {
			if (!draggingItem || !tracksRef.current) {
				return;
			}

			const rect = tracksRef.current.getBoundingClientRect();
			const x =
				e.clientX -
				rect.left +
				tracksRef.current.scrollLeft -
				dragOffset.x -
				LABEL_COL_WIDTH;
			const y = e.clientY - rect.top - dragOffset.y - TIME_RULER_HEIGHT;

			setDragPosition({ x: Math.max(0, x), y });
		},
		[draggingItem, dragOffset, tracksRef],
	);

	const handleDragEnd = useCallback(() => {
		if (!draggingItem || !tracksRef.current) {
			setDraggingItem(null);
			return;
		}

		const item = items.find((i) => i.id === draggingItem);
		if (!item) {
			setDraggingItem(null);
			return;
		}

		const newTimeMs = Math.max(0, Math.round(pixelsToMs(dragPosition.x)));
		const trackIndex = Math.floor(dragPosition.y / TRACK_HEIGHT);
		const clampedTrackIndex = Math.max(
			0,
			Math.min(trackIndex, tracks.length - 1),
		);
		const newTrack = tracks[clampedTrackIndex] ?? 0;

		if (newTimeMs !== item.start_time_ms || newTrack !== item.track) {
			const deltaMs = newTimeMs - item.start_time_ms;
			const trackChanged = newTrack !== item.track;

			if (!trackChanged && deltaMs !== 0) {
				const subsequentItems = items.filter(
					(i) =>
						i.id !== item.id &&
						i.track === item.track &&
						i.start_time_ms >= item.start_time_ms,
				);
				const updates = [
					{ generation_id: item.generation_id, start_time_ms: newTimeMs },
					...subsequentItems.map((i) => ({
						generation_id: i.generation_id,
						start_time_ms: Math.max(0, i.start_time_ms + deltaMs),
					})),
				];
				batchUpdateTimes.mutate(
					{ storyId, data: { updates } },
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
			} else {
				moveItem.mutate(
					{
						storyId,
						itemId: item.id,
						data: {
							start_time_ms: newTimeMs,
							track: newTrack,
						},
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
			}
		}

		setDraggingItem(null);
	}, [
		draggingItem,
		dragPosition,
		items,
		tracks,
		pixelsToMs,
		storyId,
		moveItem,
		batchUpdateTimes,
		toast,
		tracksRef,
	]);

	return {
		draggingItem,
		dragPosition,
		handleDragStart,
		handleDragMove,
		handleDragEnd,
	};
}
