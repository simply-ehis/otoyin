import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { StudioTrack } from "../AudioStudioStore";
import { TrackStripInner } from "./TrackStripInner";
export function SortableTrackStrip({
	track,
	index,
	trackAnalysers,
	onTranscribe,
}: {
	track: StudioTrack;
	index: number;
	trackAnalysers: Map<string, AnalyserNode>;
	onTranscribe: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: track.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="border-b border-border/50 group"
		>
			<TrackStripInner
				track={track}
				index={index}
				dragHandleProps={{ ...attributes, ...listeners }}
				trackAnalysers={trackAnalysers}
				onTranscribe={onTranscribe}
			/>
		</div>
	);
}
