import type { AutomationParam } from "@/stores/storyStore";
import { AutomationLane } from "./AutomationLane";
import { TRACK_HEIGHT } from "./timeline";

const AUTOMATION_PARAMS: Record<
	string,
	{ min: number; max: number; defaultValue: number }
> = {
	volume: { min: 0, max: 2, defaultValue: 1 },
	pan: { min: -1, max: 1, defaultValue: 0 },
	mute: { min: 0, max: 1, defaultValue: 0 },
};

interface AutomationOverlayProps {
	show: boolean;
	selectedParam: AutomationParam | null;
	tracks: number[];
	pixelsPerSecond: number;
	timelineWidth: number;
}

export function AutomationOverlay({
	show,
	selectedParam,
	tracks,
	pixelsPerSecond,
	timelineWidth,
}: AutomationOverlayProps) {
	if (!show || !selectedParam) {
		return null;
	}

	const param = AUTOMATION_PARAMS[selectedParam];
	if (!param) {
		return null;
	}

	return (
		<>
			{tracks.map((trackNumber, index) => (
				<div
					key={`auto-${trackNumber}-${selectedParam}`}
					className="absolute left-0 right-0 z-15"
					style={{
						top: `${index * TRACK_HEIGHT + 4}px`,
						height: `${TRACK_HEIGHT - 8}px`,
					}}
				>
					<AutomationLane
						track={trackNumber}
						parameter={selectedParam}
						min={param.min}
						max={param.max}
						defaultValue={param.defaultValue}
						pixelsPerSecond={pixelsPerSecond}
						totalWidth={timelineWidth}
					/>
				</div>
			))}
		</>
	);
}
