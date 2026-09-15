import type { TempoChange, TimelineMarker } from "./AudioStudioStore";
import { formatTime } from "./formatTime";

interface TimelineRulerProps {
	zoomLevel: number;
	markers: TimelineMarker[];
	currentTime: number;
	tempoMap: TempoChange[];
	timeSignature: [number, number];
	onSeek: (time: number) => void;
	onRemoveMarker: (id: string) => void;
	onAddTempoChange?: (time: number) => void;
}

function getBpmAt(tempoMap: TempoChange[], time: number): number {
	let bpm = 120;
	for (const tc of tempoMap) {
		if (tc.time <= time) {
			bpm = tc.bpm;
		}
	}
	return bpm;
}

function secondsToBarsBeats(
	time: number,
	tempoMap: TempoChange[],
	timeSig: [number, number],
): string {
	let bar = 1;
	let beatInBar = 0;
	let lastTime = 0;
	let bpm = 120;
	const beatsPerBar = timeSig[0];

	for (const tc of tempoMap) {
		if (tc.time > time) {
			break;
		}
		if (tc.time > lastTime) {
			const segDuration = tc.time - lastTime;
			const beatDur = 60 / bpm;
			const beats = segDuration / beatDur;
			const wholeBeats = Math.floor(beatInBar + beats);
			bar += Math.floor(wholeBeats / beatsPerBar);
			beatInBar = wholeBeats % beatsPerBar;
		}
		lastTime = tc.time;
		bpm = tc.bpm;
	}

	const segDuration = time - lastTime;
	const beatDur = 60 / bpm;
	const beats = segDuration / beatDur;
	const wholeBeats = Math.floor(beatInBar + beats);
	bar += Math.floor(wholeBeats / beatsPerBar);
	const finalBeat = (wholeBeats % beatsPerBar) + 1;

	return `${bar}:${finalBeat}`;
}

export function TimelineRuler({
	zoomLevel,
	markers,
	currentTime,
	tempoMap,
	timeSignature,
	onSeek,
	onRemoveMarker,
	onAddTempoChange,
}: TimelineRulerProps) {
	const pxPerSecond = 64 / (5 * zoomLevel);
	const markerCount = 20;

	const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const rulerLeft = 100;
		const x = e.clientX - rect.left - rulerLeft;
		if (x < 0) {
			return;
		}
		const time = x / pxPerSecond;
		onSeek(time);
	};

	const handleDoubleClick = () => {
		if (onAddTempoChange) {
			onAddTempoChange(currentTime);
		}
	};

	const barsBeats = secondsToBarsBeats(currentTime, tempoMap, timeSignature);
	const currentBpm = getBpmAt(tempoMap, currentTime);

	return (
		<div
			className="relative h-6 border-b border-border bg-muted shrink-0 overflow-hidden cursor-pointer select-none"
			onClick={handleRulerClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={(e) => {
				if (e.key === "ArrowLeft") {
					onSeek(Math.max(0, currentTime - 1));
				} else if (e.key === "ArrowRight") {
					onSeek(currentTime + 1);
				}
			}}
			tabIndex={0}
			role="slider"
			aria-label="Timeline ruler — click to seek, double-click to add tempo change"
			aria-valuemin={0}
			aria-valuemax={markerCount * 5 * zoomLevel}
			aria-valuenow={currentTime}
		>
			{/* Grid lines — subtle vertical lines at each 5s interval */}
			<div className="absolute inset-0 flex items-stretch px-[100px] pointer-events-none">
				{[...Array(markerCount).keys()].map((i) => (
					<div
						key={`grid-${String(i)}`}
						className="w-16 shrink-0 border-l border-border/40"
					/>
				))}
			</div>

			{/* Time labels */}
			<div className="absolute inset-0 flex items-end px-[100px]">
				<div className="flex text-[10px] font-mono text-muted-foreground/50">
					{[...Array(markerCount).keys()].map((i) => (
						<div key={String(i)} className="w-16 shrink-0 relative">
							<span className="absolute bottom-0 left-0">
								{formatTime(i * 5 * zoomLevel)}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Playhead — red vertical line */}
			<div
				className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
				style={{ left: `${100 + currentTime * pxPerSecond}px` }}
				title={`${barsBeats} | ${currentBpm} BPM`}
			>
				{/* Playhead triangle */}
				<div className="absolute -top-0.5 -left-[5px] size-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500" />
			</div>

			{/* Tempo change markers */}
			{tempoMap.map((tc, idx) => {
				if (tc.time === 0) {
					return null;
				}
				const left = 100 + tc.time * pxPerSecond;
				return (
					<div
						key={`tempo-${String(idx)}`}
						className="absolute top-0 h-full w-2 -translate-x-1/2 flex flex-col items-center z-20"
						style={{ left }}
						title={`${tc.bpm} BPM`}
					>
						<span className="text-[8px] text-accent font-bold bg-muted/80 px-0.5 rounded">
							{tc.bpm}
						</span>
						<span className="w-px flex-1 bg-accent/40" />
					</div>
				);
			})}

			{/* Markers */}
			{markers.map((marker) => {
				const left = 100 + marker.time * pxPerSecond;
				return (
					<button
						key={marker.id}
						type="button"
						className="absolute top-0 h-full w-3 -translate-x-1/2 flex flex-col items-center justify-start group z-20"
						style={{ left }}
						onClick={(e) => {
							e.stopPropagation();
							onSeek(marker.time);
						}}
						onContextMenu={(e) => {
							e.preventDefault();
							e.stopPropagation();
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
