import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/ui/use-toast";
import type { StoryItemDetail } from "@/lib/api/types";
import { ERR_DESC_STORY_FAILED, ERR_TITLE_STORY } from "@/lib/errorMessages";
import type {
	useTrimStoryItem,
	useUpdateStoryItemTimes,
} from "@/lib/hooks/useStories";

type TrimItem = ReturnType<typeof useTrimStoryItem>;
type BatchUpdateTimes = ReturnType<typeof useUpdateStoryItemTimes>;

interface UseStoryTrimArgs {
	storyId: string;
	items: StoryItemDetail[];
	pixelsToMs: (px: number) => number;
	trimItem: TrimItem;
	batchUpdateTimes: BatchUpdateTimes;
	setSelectedClipId: (id: string | null) => void;
	tracksRef: RefObject<HTMLDivElement | null>;
}

export function useStoryTrim({
	storyId,
	items,
	pixelsToMs,
	trimItem,
	batchUpdateTimes,
	setSelectedClipId,
	tracksRef,
}: UseStoryTrimArgs) {
	const { toast } = useToast();

	// Trim state
	const [trimmingItem, setTrimmingItem] = useState<string | null>(null);
	const [trimSide, setTrimSide] = useState<"start" | "end" | null>(null);
	const [trimStartX, setTrimStartX] = useState(0);
	const [tempTrimValues, setTempTrimValues] = useState<{
		trim_start_ms: number;
		trim_end_ms: number;
	} | null>(null);

	const trimStartItemRef = useRef<{
		item: StoryItemDetail;
		initialTrimStart: number;
		initialTrimEnd: number;
	} | null>(null);

	const handleTrimStart = (
		e: React.MouseEvent,
		item: StoryItemDetail,
		side: "start" | "end",
	) => {
		e.stopPropagation();
		if (!tracksRef.current) {
			return;
		}
		setTrimmingItem(item.id);
		setTrimSide(side);
		setSelectedClipId(item.id);
		setTrimStartX(e.clientX);
		trimStartItemRef.current = {
			item,
			initialTrimStart: item.trim_start_ms || 0,
			initialTrimEnd: item.trim_end_ms || 0,
		};
	};

	const handleTrimMove = useCallback(
		(e: MouseEvent) => {
			if (!trimmingItem || !trimSide || !trimStartItemRef.current) {
				return;
			}

			const deltaX = e.clientX - trimStartX;
			const deltaMs = pixelsToMs(deltaX); // Signed delta in milliseconds

			const { item, initialTrimStart, initialTrimEnd } =
				trimStartItemRef.current;
			const originalDurationMs = item.duration * 1000;

			let newTrimStart = initialTrimStart;
			let newTrimEnd = initialTrimEnd;

			if (trimSide === "start") {
				// Moving right increases trim_start (trims more from start)
				// Moving left decreases trim_start (restores from start)
				newTrimStart = Math.round(
					Math.max(
						0,
						Math.min(
							initialTrimStart + deltaMs,
							originalDurationMs - initialTrimEnd - 100,
						),
					),
				);
			} else {
				// Moving right decreases trim_end (restores from end)
				// Moving left increases trim_end (trims more from end)
				newTrimEnd = Math.round(
					Math.max(
						0,
						Math.min(
							initialTrimEnd - deltaMs,
							originalDurationMs - initialTrimStart - 100,
						),
					),
				);
			}

			// Validate that we don't exceed duration
			if (newTrimStart + newTrimEnd >= originalDurationMs - 100) {
				return; // Don't allow trimming to less than 100ms
			}

			// Update temporary trim values for visual feedback
			setTempTrimValues({
				trim_start_ms: newTrimStart,
				trim_end_ms: newTrimEnd,
			});
		},
		[trimmingItem, trimSide, trimStartX, pixelsToMs],
	);

	const handleTrimEnd = useCallback(() => {
		if (!trimmingItem || !trimSide || !trimStartItemRef.current) {
			setTrimmingItem(null);
			setTrimSide(null);
			setTempTrimValues(null);
			trimStartItemRef.current = null;
			return;
		}

		const { initialTrimStart, initialTrimEnd } = trimStartItemRef.current;

		// Use temporary trim values if available, otherwise use initial values
		// Ensure values are integers for the backend
		const finalTrimStart = Math.round(
			tempTrimValues?.trim_start_ms ?? initialTrimStart,
		);
		const finalTrimEnd = Math.round(
			tempTrimValues?.trim_end_ms ?? initialTrimEnd,
		);

		// Only update if values changed
		if (
			finalTrimStart !== initialTrimStart ||
			finalTrimEnd !== initialTrimEnd
		) {
			// Ripple on trim-start: shift start_time_ms to keep end point stable
			const trimStartDelta = finalTrimStart - initialTrimStart;
			const needsRipple = trimSide === "start" && trimStartDelta !== 0;

			const applyTrim = () => {
				trimItem.mutate(
					{
						storyId,
						itemId: trimmingItem,
						data: {
							trim_start_ms: finalTrimStart,
							trim_end_ms: finalTrimEnd,
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
			};

			if (needsRipple) {
				const item = items.find((i) => i.id === trimmingItem);
				if (item) {
					const newStartTimeMs = Math.max(
						0,
						item.start_time_ms + trimStartDelta,
					);
					// Update both trim and start_time for the trimmed item,
					// plus ripple-shift subsequent items on the same track
					const subsequentItems = items.filter(
						(i) =>
							i.id !== item.id &&
							i.track === item.track &&
							i.start_time_ms >= item.start_time_ms,
					);
					const updates = [
						{
							generation_id: item.generation_id,
							start_time_ms: newStartTimeMs,
						},
						...subsequentItems.map((i) => ({
							generation_id: i.generation_id,
							start_time_ms: Math.max(0, i.start_time_ms + trimStartDelta),
						})),
					];
					batchUpdateTimes.mutate(
						{ storyId, data: { updates } },
						{
							onSuccess: applyTrim,
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
			} else {
				applyTrim();
			}
		}

		setTrimmingItem(null);
		setTrimSide(null);
		setTempTrimValues(null);
		trimStartItemRef.current = null;
	}, [
		trimmingItem,
		trimSide,
		tempTrimValues,
		storyId,
		trimItem,
		batchUpdateTimes,
		items,
		toast,
	]);

	// Add global mouse listeners for trimming
	useEffect(() => {
		if (trimmingItem) {
			window.addEventListener("mousemove", handleTrimMove);
			window.addEventListener("mouseup", handleTrimEnd);
			return () => {
				window.removeEventListener("mousemove", handleTrimMove);
				window.removeEventListener("mouseup", handleTrimEnd);
			};
		}
	}, [trimmingItem, handleTrimMove, handleTrimEnd]);

	return {
		trimmingItem,
		tempTrimValues,
		handleTrimStart,
	} as const;
}
