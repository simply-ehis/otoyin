import { formatTime, LABEL_COL_WIDTH } from "./timeline";

interface TimelineRulerProps {
	timelineWidth: number;
	timeMarkers: number[];
	msToPixels: (ms: number) => number;
	onTimelineClick: (e: React.MouseEvent<HTMLElement>) => void;
}

export function TimelineRuler({
	timelineWidth,
	timeMarkers,
	msToPixels,
	onTimelineClick,
}: TimelineRulerProps) {
	return (
		<div
			className="flex sticky top-0 z-30"
			style={{ width: `${timelineWidth + LABEL_COL_WIDTH}px` }}
		>
			<div className="w-16 h-6 shrink-0 border-b border-r bg-muted/30 sticky left-0 z-40" />
			<button
				type="button"
				className="h-6 border-b bg-muted/20 cursor-pointer text-left relative"
				style={{ width: `${timelineWidth}px` }}
				onClick={onTimelineClick}
				aria-label="Seek timeline"
			>
				{timeMarkers.map((ms) => (
					<div
						key={ms}
						className="absolute top-0 h-full flex flex-col justify-end pointer-events-none"
						style={{ left: `${msToPixels(ms)}px` }}
					>
						<div className="h-2 w-px bg-border" />
						<span className="text-xs text-muted-foreground ml-1 select-none">
							{formatTime(ms)}
						</span>
					</div>
				))}
			</button>
		</div>
	);
}
