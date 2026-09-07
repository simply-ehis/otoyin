import {
	MicrophoneIcon,
	StopIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/primitives";
import { hueLine, hueText } from "../hueIdentity";
import type { TakeLane as TakeLaneType } from "./compingTypes";
import { formatMs, TOTAL_DURATION_MS } from "./compingUtils";

interface TakeLaneProps {
	lane: TakeLaneType;
	laneIndex: number;
	isRecording: boolean;
	recordingLaneId: string | null;
	duration: number;
	onAddRegion: (laneId: string) => void;
	onRecord: (laneId: string) => void;
	onStopRecording: () => void;
	onRemove: (laneId: string) => void;
	onSelectRegion: (laneId: string, regionId: string) => void;
}

export function TakeLaneComponent({
	lane,
	laneIndex,
	isRecording,
	recordingLaneId,
	duration,
	onAddRegion,
	onRecord,
	onStopRecording,
	onRemove,
	onSelectRegion,
}: TakeLaneProps) {
	return (
		<div
			className={cn(
				"space-y-1.5 rounded-md border border-border bg-card p-3",
				"border-l-[3px]",
				hueLine(laneIndex),
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					{" "}
					<span
						className={cn("truncate text-xs font-medium", hueText(laneIndex))}
					>
						{lane.name}
					</span>
					<Badge tone="neutral">{lane.regions.length} regions</Badge>
					{lane.audioBase64 ? <Badge tone="accent">Has audio</Badge> : null}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-xs"
						title="Add region"
						aria-label={`Add region to ${lane.name}`}
						onClick={() => onAddRegion(lane.id)}
					>
						+ Region
					</Button>
					<Button
						type="button"
						variant={recordingLaneId === lane.id ? "destructive" : "ghost"}
						size="sm"
						className="h-6 px-2 text-xs"
						disabled={isRecording && recordingLaneId !== lane.id}
						title={
							recordingLaneId === lane.id
								? "Stop recording"
								: `Record take on ${lane.name}`
						}
						aria-label={
							recordingLaneId === lane.id
								? "Stop recording"
								: `Record take on ${lane.name}`
						}
						onClick={() =>
							recordingLaneId === lane.id
								? onStopRecording()
								: onRecord(lane.id)
						}
					>
						{recordingLaneId === lane.id ? (
							<StopIcon className="size-3" aria-hidden="true" />
						) : (
							<MicrophoneIcon className="size-3" aria-hidden="true" />
						)}
					</Button>
					{recordingLaneId === lane.id && (
						<span className="text-xs tabular-nums text-destructive">
							{formatMs(duration * 1000)}
						</span>
					)}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-xs text-destructive hover:text-destructive"
						title={`Remove ${lane.name}`}
						aria-label={`Remove ${lane.name}`}
						onClick={() => onRemove(lane.id)}
					>
						<TrashIcon className="size-3" aria-hidden="true" />
					</Button>
				</div>
			</div>
			<div className="relative h-12 overflow-hidden rounded-md bg-secondary">
				{lane.regions.map((region) => {
					const left = (region.startMs / TOTAL_DURATION_MS) * 100;
					const width =
						((region.endMs - region.startMs) / TOTAL_DURATION_MS) * 100;
					const selected = lane.selectedRegionId === region.id;
					return (
						<button
							key={region.id}
							type="button"
							aria-pressed={selected}
							className={cn(
								"absolute bottom-1 top-1 flex items-center justify-center overflow-hidden rounded-sm text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								selected
									? "border border-accent bg-accent-muted text-foreground"
									: "border border-border bg-card text-muted-foreground hover:border-strong",
							)}
							style={{ left: `${left}%`, width: `${width}%` }}
							title={`${region.label} (${formatMs(region.startMs)} → ${formatMs(region.endMs)})`}
							aria-label={`Select ${region.label}`}
							onClick={() => onSelectRegion(lane.id, region.id)}
						>
							<span className="truncate px-1">{region.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
