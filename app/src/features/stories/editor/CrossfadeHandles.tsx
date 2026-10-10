import { TRACK_HEIGHT } from "./timeline";

interface CrossfadeOverlap {
	id: string;
	leftItemId: string;
	rightItemId: string;
	track: number;
	overlapStartMs: number;
	overlapEndMs: number;
}

interface CrossfadeHandlesProps {
	overlaps: CrossfadeOverlap[];
	tracks: number[];
	msToPixels: (ms: number) => number;
	onDragStart: (e: React.MouseEvent, overlap: CrossfadeOverlap) => void;
}

export function CrossfadeHandles({
	overlaps,
	tracks,
	msToPixels,
	onDragStart,
}: CrossfadeHandlesProps) {
	return (
		<>
			{overlaps.map((overlap) => {
				const trackIndex = tracks.indexOf(overlap.track);
				if (trackIndex === -1) {
					return null;
				}
				const midMs = (overlap.overlapStartMs + overlap.overlapEndMs) / 2;
				const leftPx = msToPixels(midMs) - 6;
				const topPx = trackIndex * TRACK_HEIGHT + TRACK_HEIGHT / 2 - 10;
				return (
					<button
						key={overlap.id}
						type="button"
						data-crossfade-handle=""
						className="absolute z-25 w-3 h-5 cursor-ew-resize flex items-center justify-center rounded bg-strong hover:brightness-110 border border-primary/50 transition-[filter] pointer-events-auto"
						style={{ left: `${leftPx}px`, top: `${topPx}px` }}
						onMouseDown={(e) => onDragStart(e, overlap)}
						title="Drag to adjust crossfade"
						aria-label="Adjust crossfade"
					>
						<span className="text-[6px] text-primary-foreground font-bold">
							X
						</span>
					</button>
				);
			})}
		</>
	);
}

export type { CrossfadeOverlap };
