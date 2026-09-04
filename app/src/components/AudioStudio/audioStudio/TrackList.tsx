import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MusicalNoteIcon as Music } from "@heroicons/react/24/outline";
import { EmptyState } from "@/components/ui/EmptyState";
import type { StudioTrack } from "../AudioStudioStore";
import { SortableTrackStrip } from "./SortableTrackStrip";

interface TrackListProps {
	tracks: StudioTrack[];
	sensors: ReturnType<typeof import("@dnd-kit/core").useSensors>;
	activeDragId: string | null;
	trackAnalysers: Map<string, AnalyserNode>;
	onDragStart: (e: DragStartEvent) => void;
	onDragEnd: (e: DragEndEvent) => void;
	onTranscribe: (index: number) => void;
}

export function TrackList({
	tracks,
	sensors,
	activeDragId,
	trackAnalysers,
	onDragStart,
	onDragEnd,
	onTranscribe,
}: TrackListProps) {
	if (tracks.length === 0) {
		return (
			<div className="flex items-center justify-center h-full">
				<EmptyState
					icon={<Music className="size-6" />}
					title="No tracks yet"
					description="Add a track to begin."
				/>
			</div>
		);
	}
	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
		>
			<SortableContext
				items={tracks.map((t) => t.id)}
				strategy={verticalListSortingStrategy}
			>
				{tracks.map((track, index) => (
					<SortableTrackStrip
						key={track.id}
						track={track}
						index={index}
						trackAnalysers={trackAnalysers}
						onTranscribe={() => onTranscribe(index)}
					/>
				))}
			</SortableContext>
			<DragOverlay>
				{activeDragId ? (
					<div className="bg-card/80 border border-border rounded p-2 text-xs text-foreground">
						{tracks.find((t) => t.id === activeDragId)?.name ?? "Track"}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
