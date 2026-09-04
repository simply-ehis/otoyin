import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { StoryItemDetail } from "@/lib/api/types";
import { ERR_DESC_STORY_FAILED, ERR_TITLE_STORY } from "@/lib/errorMessages";
import type { useTrimStoryItem } from "@/lib/hooks/useStories";
import { LABEL_COL_WIDTH } from "./timeline";

type TrimItem = ReturnType<typeof useTrimStoryItem>;

interface UseStoryCrossfadeArgs {
	items: StoryItemDetail[];
	storyId: string;
	trimItem: TrimItem;
	pixelsToMs: (px: number) => number;
	tracksRef: RefObject<HTMLDivElement | null>;
}

type Overlap = {
	id: string;
	leftItemId: string;
	rightItemId: string;
	track: number;
	overlapStartMs: number;
	overlapEndMs: number;
};

export function useStoryCrossfade({
	items,
	storyId,
	trimItem,
	pixelsToMs,
	tracksRef,
}: UseStoryCrossfadeArgs) {
	const { toast } = useToast();

	const crossfadeOverlaps = useMemo(() => {
		const overlaps: Overlap[] = [];
		// Group items by track
		const byTrack = new Map<number, StoryItemDetail[]>();
		for (const item of items) {
			const list = byTrack.get(item.track) ?? [];
			list.push(item);
			byTrack.set(item.track, list);
		}
		for (const [, trackItems] of byTrack) {
			const sorted = [...trackItems].sort(
				(a, b) => a.start_time_ms - b.start_time_ms,
			);
			for (let i = 0; i < sorted.length - 1; i++) {
				const left = sorted[i];
				const right = sorted[i + 1];
				const leftEndMs =
					left.start_time_ms +
					left.duration * 1000 -
					(left.trim_start_ms || 0) -
					(left.trim_end_ms || 0);
				const rightStartMs = right.start_time_ms;
				if (leftEndMs > rightStartMs) {
					overlaps.push({
						id: `${left.id}__${right.id}`,
						leftItemId: left.id,
						rightItemId: right.id,
						track: left.track,
						overlapStartMs: rightStartMs,
						overlapEndMs: leftEndMs,
					});
				}
			}
		}
		return overlaps;
	}, [items]);

	const [draggingCrossfade, setDraggingCrossfade] = useState<string | null>(
		null,
	);
	const crossfadeDragRef = useRef<{
		leftItemId: string;
		rightItemId: string;
		track: number;
		startX: number;
		overlapStartMs: number;
		overlapEndMs: number;
		currentMs: number;
	} | null>(null);

	const handleCrossfadeDragStart = useCallback(
		(e: React.MouseEvent, overlap: Overlap) => {
			e.stopPropagation();
			e.preventDefault();
			setDraggingCrossfade(overlap.id);
			crossfadeDragRef.current = {
				leftItemId: overlap.leftItemId,
				rightItemId: overlap.rightItemId,
				track: overlap.track,
				startX: e.clientX,
				overlapStartMs: overlap.overlapStartMs,
				overlapEndMs: overlap.overlapEndMs,
				currentMs: (overlap.overlapStartMs + overlap.overlapEndMs) / 2,
			};
		},
		[],
	);

	const handleCrossfadeDragMove = useCallback(
		(e: MouseEvent) => {
			if (
				!draggingCrossfade ||
				!crossfadeDragRef.current ||
				!tracksRef.current
			) {
				return;
			}
			const rect = tracksRef.current.getBoundingClientRect();
			const x =
				e.clientX - rect.left + tracksRef.current.scrollLeft - LABEL_COL_WIDTH;
			const dragMs = pixelsToMs(x);
			const ref = crossfadeDragRef.current;

			// Clamp to overlap region and store for mouseup
			ref.currentMs = Math.max(
				ref.overlapStartMs,
				Math.min(dragMs, ref.overlapEndMs),
			);
		},
		[draggingCrossfade, pixelsToMs, tracksRef],
	);

	const handleCrossfadeDragEnd = useCallback(() => {
		if (!draggingCrossfade || !crossfadeDragRef.current) {
			setDraggingCrossfade(null);
			return;
		}
		const ref = crossfadeDragRef.current;
		const leftItem = items.find((i) => i.id === ref.leftItemId);
		const rightItem = items.find((i) => i.id === ref.rightItemId);

		if (leftItem && rightItem) {
			const leftOrigEndMs = leftItem.start_time_ms + leftItem.duration * 1000;
			const crossfadePointMs = ref.currentMs;

			const newLeftTrimEnd = Math.max(
				0,
				Math.min(
					leftOrigEndMs - crossfadePointMs,
					leftItem.duration * 1000 - (leftItem.trim_start_ms || 0) - 100,
				),
			);
			const newRightTrimStart = Math.max(
				0,
				Math.min(
					crossfadePointMs - rightItem.start_time_ms,
					rightItem.duration * 1000 - (rightItem.trim_end_ms || 0) - 100,
				),
			);

			if (
				newLeftTrimEnd !== (leftItem.trim_end_ms || 0) ||
				newRightTrimStart !== (rightItem.trim_start_ms || 0)
			) {
				// Chain left → right: only trim right item if left succeeds
				trimItem.mutate(
					{
						storyId,
						itemId: leftItem.id,
						data: {
							trim_start_ms: leftItem.trim_start_ms || 0,
							trim_end_ms: Math.round(newLeftTrimEnd),
						},
					},
					{
						onSuccess: () => {
							trimItem.mutate(
								{
									storyId,
									itemId: rightItem.id,
									data: {
										trim_start_ms: Math.round(newRightTrimStart),
										trim_end_ms: rightItem.trim_end_ms || 0,
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
			}
		}

		setDraggingCrossfade(null);
		crossfadeDragRef.current = null;
	}, [draggingCrossfade, items, storyId, trimItem, toast]);

	// Wire crossfade drag to mouse events
	useEffect(() => {
		if (!draggingCrossfade) {
			return;
		}
		const onMove = (e: MouseEvent) => handleCrossfadeDragMove(e);
		const onUp = () => handleCrossfadeDragEnd();
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, [draggingCrossfade, handleCrossfadeDragMove, handleCrossfadeDragEnd]);

	return {
		crossfadeOverlaps,
		handleCrossfadeDragStart,
	} as const;
}
