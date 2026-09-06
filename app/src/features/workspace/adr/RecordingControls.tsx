import {
	BackwardIcon,
	ClockIcon,
	ForwardIcon,
} from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_ADR } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import type { useToast } from "@/ui/use-toast";
import type { ADRLine } from "./types";

interface RecordingControlsProps {
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
	toast: ReturnType<typeof useToast>["toast"];
	guideUrl: string;
}

export function RecordingControls({
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
}: RecordingControlsProps) {
	function handleRecord() {
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
	}

	function handleAlign() {
		if (!activeLine || !hasGuide) {
			return;
		}
		const takeId = activeLine.selected_take_id ?? activeLine.takes?.[0]?.id;
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
	}

	return (
		<div className="flex flex-wrap items-center gap-3">
			<Button
				type="button"
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
				onClick={handleRecord}
			>
				<span
					aria-hidden="true"
					className={cn(
						"mr-1 inline-block size-2.5 rounded-full",
						recording.isRecording
							? "animate-pulse bg-destructive-foreground"
							: "bg-primary-foreground",
					)}
				/>
				{recording.isRecording
					? `Stop (${recording.duration.toFixed(1)}s)`
					: "Record"}
			</Button>

			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					title="Shift earlier"
					aria-label="Shift earlier"
					onClick={() => setShiftMs((v) => Math.max(-500, v - 10))}
				>
					<BackwardIcon className="size-3.5" aria-hidden="true" />
				</Button>
				<span className="w-14 text-center text-xs tabular-nums text-muted-foreground">
					{shiftMs}ms
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					title="Shift later"
					aria-label="Shift later"
					onClick={() => setShiftMs((v) => Math.min(500, v + 10))}
				>
					<ForwardIcon className="size-3.5" aria-hidden="true" />
				</Button>
			</div>

			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-7 text-xs"
				disabled={
					!hasGuide ||
					!activeLine ||
					(activeLine.takes ?? []).length === 0 ||
					alignMut.isPending
				}
				title="Align selected take to guide via cross-correlation"
				aria-label="Align take to guide"
				onClick={handleAlign}
			>
				{alignMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
				Align
			</Button>

			<div className="ml-auto flex items-center gap-2">
				<ClockIcon
					className="size-3.5 text-muted-foreground"
					aria-hidden="true"
				/>
				<Slider
					min={-500}
					max={500}
					step={10}
					value={[shiftMs]}
					onValueChange={([v]) => setShiftMs(v ?? 0)}
					className="w-24"
					aria-label="Manual shift milliseconds"
				/>
			</div>
		</div>
	);
}
