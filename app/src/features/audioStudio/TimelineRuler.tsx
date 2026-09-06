import type { TimelineMarker } from "./AudioStudioStore";
import { formatTime } from "./formatTime";

interface TimelineRulerProps {
	zoomLevel: number;
	markers: TimelineMarker[];
	onSeek: (time: number) => void;
	onRemoveMarker: (id: string) => void;
}

export function TimelineRuler({
	zoomLevel,
	markers,
	onSeek,
	onRemoveMarker,
}: TimelineRulerProps) {
	return (
		<div className="relative h-6 border-b border-border bg-muted flex items-end px-[100px] shrink-0 overflow-hidden">
			<div className="flex gap-1 text-xs font-mono text-muted-foreground/50">
				{[...Array(20).keys()].map((i) => (
					<span key={String(i)} className="w-16 shrink-0">
						{formatTime(i * 5 * zoomLevel)}
					</span>
				))}
			</div>
			{markers.map((marker) => {
				const left = 100 + marker.time * (64 / (5 * zoomLevel));
				return (
					<button
						key={marker.id}
						type="button"
						className="absolute top-0 h-full w-3 -translate-x-1/2 flex flex-col items-center justify-start group"
						style={{ left }}
						onClick={() => onSeek(marker.time)}
						onContextMenu={(e) => {
							e.preventDefault();
							onRemoveMarker(marker.id);
						}}
						title={
							marker.label
								? `Marker: ${marker.label} (${formatTime(marker.time)}) — click to jump, right-click to delete`
								: `Marker at ${formatTime(marker.time)} — click to jump, right-click to delete`
						}
						aria-label={`Jump to marker at ${formatTime(marker.time)}`}
					>
						<span className="mt-0.5 size-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-accent" />
						<span className="w-px flex-1 bg-accent-muted group-hover:bg-accent" />
					</button>
				);
			})}
		</div>
	);
}
