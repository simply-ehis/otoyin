import {
	CircleStackIcon as Circle,
	BackwardIcon as SkipBack,
	ForwardIcon as SkipForward,
	ClockIcon as Timer,
} from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { Slider } from "@/components/ui/slider";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_ADR } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";
import type { ADRLine } from "./ADRViewTypes";

interface AdrRecordingControlsProps {
	activeLine: ADRLine | null;
	hasGuide: boolean;
	recording: {
		isRecording: boolean;
		duration: number;
		error: string | null;
		startRecording: () => void;
		stopRecording: () => void;
		cancelRecording: () => void;
	};
	shiftMs: number;
	setShiftMs: React.Dispatch<React.SetStateAction<number>>;
	startRecord: (lineId: string) => void;
	stopRecord: () => void;
	alignMut: UseMutationResult<
		{ alignment_offset_ms: number },
		Error,
		{ guideUrl: string; takeUrl: string }
	>;
	toast: (props: {
		title: string;
		description?: string;
		variant?: "default" | "destructive" | "success" | null;
	}) => void;
	guideUrl: string;
}

export function AdrRecordingControls({
	activeLine,
	hasGuide,
	recording,
	shiftMs,
	setShiftMs,
	startRecord,
	stopRecord,
	alignMut,
	toast,
	guideUrl,
}: AdrRecordingControlsProps) {
	return (
		<div className="flex items-center gap-3">
			<Button
				variant={recording.isRecording ? "destructive" : "default"}
				size="sm"
				className="h-8"
				disabled={!activeLine || !hasGuide}
				title={
					!hasGuide
						? "Import a guide track first"
						: !activeLine
							? "Select a line"
							: undefined
				}
				onClick={() => {
					if (!activeLine) {
						return;
					}
					if (!hasGuide) {
						toast({
							title: "Guide required",
							description: "Import a guide track before recording takes.",
							variant: "destructive",
						});
						return;
					}
					if (!recording.isRecording) {
						startRecord(activeLine.id);
					} else {
						stopRecord();
					}
				}}
			>
				<Circle
					className={cn(
						"size-4 mr-1",
						recording.isRecording && "animate-pulse",
					)}
				/>
				{recording.isRecording
					? `Stop (${recording.duration.toFixed(1)}s)`
					: "Record"}
			</Button>

			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title="Shift earlier"
					onClick={() => setShiftMs((v) => Math.max(-500, v - 10))}
				>
					<SkipBack className="h-3.5 w-3.5" />
				</Button>
				<span className="text-xs text-muted-foreground w-14 text-center tabular-nums">
					{shiftMs}ms
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title="Shift later"
					onClick={() => setShiftMs((v) => Math.min(500, v + 10))}
				>
					<SkipForward className="h-3.5 w-3.5" />
				</Button>
			</div>

			<Button
				variant="outline"
				size="sm"
				className="h-7 text-xs"
				disabled={
					!hasGuide ||
					!activeLine ||
					(activeLine.takes ?? []).length === 0 ||
					alignMut.isPending
				}
				title={
					!hasGuide
						? "Guide required for alignment"
						: !activeLine?.selected_take_id &&
								(activeLine?.takes ?? []).length === 0
							? "Record a take first"
							: "Align selected take to guide via cross-correlation"
				}
				onClick={() => {
					if (!activeLine || !hasGuide) {
						return;
					}
					const takeId =
						activeLine.selected_take_id ?? activeLine.takes?.[0]?.id;
					if (!takeId) {
						toast({
							title: ERR_TITLE_ADR,
							description: "Select a take to align",
							variant: "destructive",
						});
						return;
					}
					alignMut.mutate({
						guideUrl,
						takeUrl: apiClient.getADRTakeAudioUrl(takeId),
					});
				}}
			>
				{alignMut.isPending ? <Spinner /> : "Align"}
			</Button>

			<div className="flex items-center gap-2 ml-auto">
				<Timer className="h-3.5 w-3.5 text-muted-foreground" />
				<Slider
					min={-500}
					max={500}
					step={10}
					value={[shiftMs]}
					onValueChange={([v]) => setShiftMs(v)}
					className="w-24"
				/>
			</div>
		</div>
	);
}
