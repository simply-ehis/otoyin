import type { StoryItemDetail } from "@/lib/api/types";
import { TRACK_HEIGHT } from "./timeline";

export function getClipStyle(
	item: StoryItemDetail,
	draggingItem: string | null,
	dragPosition: { x: number; y: number },
	msToPixels: (ms: number) => number,
	tracks: number[],
) {
	const isDragging = draggingItem === item.id;
	const trackIndex = tracks.indexOf(item.track);
	const effectiveDuration =
		(item.duration * 1000 -
			(item.trim_start_ms || 0) -
			(item.trim_end_ms || 0)) /
		(item.speed || 1);
	const width = msToPixels(effectiveDuration);
	const left = isDragging ? dragPosition.x : msToPixels(item.start_time_ms);
	const top = isDragging ? dragPosition.y : trackIndex * TRACK_HEIGHT;

	return {
		width: `${width}px`,
		left: `${left}px`,
		top: `${top}px`,
		height: `${TRACK_HEIGHT - 4}px`,
	};
}
