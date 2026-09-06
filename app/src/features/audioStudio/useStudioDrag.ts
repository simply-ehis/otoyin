import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useState } from "react";
import type { StudioTrack } from "./AudioStudioStore";

export function useStudioDrag(
	tracks: StudioTrack[],
	moveTrack: (oldIndex: number, newIndex: number) => void,
	pushUndo: (label: string) => void,
) {
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	const handleDragStart = useCallback(
		(e: DragStartEvent) => setActiveDragId(e.active.id as string),
		[],
	);
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveDragId(null);
			const { active, over } = event;
			if (!over || active.id === over.id) {
				return;
			}
			const oldIndex = tracks.findIndex((t) => t.id === active.id);
			const newIndex = tracks.findIndex((t) => t.id === over.id);
			if (oldIndex === -1 || newIndex === -1) {
				return;
			}
			pushUndo("Reorder tracks");
			moveTrack(oldIndex, newIndex);
		},
		[tracks, pushUndo, moveTrack],
	);
	return { activeDragId, handleDragStart, handleDragEnd };
}
