import {
	MicrophoneIcon as Mic,
	StopIcon as Square,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { CircleButton } from "@/components/ui/circle-button";
import { useAudioBus } from "@/lib/audio/audioBus";
import { showStudioErrorToast } from "@/lib/errors";
import { useMonitorStream } from "@/lib/hooks/useMonitorStream";
import { useToast } from "@/ui/use-toast";

interface MonitorRecorderProps {
	/** Called with the recorded blob + duration when capture finishes. */
	onRecordComplete: (blob: Blob, duration: number) => void;
}

export function MonitorRecorder({ onRecordComplete }: MonitorRecorderProps) {
	const { toast } = useToast();
	const stream = useMonitorStream();
	const monitorSourceId = useAudioBus((s) => s.monitor.sourceId);
	const source = monitorSourceId
		? useAudioBus.getState().sources[monitorSourceId]
		: null;

	const [recording, setRecording] = useState(false);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const startTimeRef = useRef<number>(0);

	const startRecording = useCallback(() => {
		if (!stream || stream.getTracks().every((t) => !t.enabled)) {
			toast({
				title: "No monitor source",
				description: "Select a live source in the Monitor picker first.",
			});
			return;
		}
		if (stream.getTracks().every((t) => t.readyState !== "live")) {
			toast({
				title: "Monitor source not active",
				description: "Start playing the source before recording.",
			});
			return;
		}

		chunksRef.current = [];
		const recorder = new MediaRecorder(stream, {
			mimeType: "audio/webm;codecs=opus",
		});
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				chunksRef.current.push(e.data);
			}
		};
		recorder.onstop = () => {
			const blob = new Blob(chunksRef.current, { type: "audio/webm" });
			const duration = (Date.now() - startTimeRef.current) / 1000;
			onRecordComplete(blob, duration);
			setRecording(false);
		};
		recorder.onerror = (err) => {
			showStudioErrorToast(err);
			setRecording(false);
		};

		recorder.start(250);
		recorderRef.current = recorder;
		startTimeRef.current = Date.now();
		setRecording(true);
		toast({ title: `Recording from ${source?.label ?? "monitor"}…` });
	}, [stream, source, toast, onRecordComplete]);

	const stopRecording = useCallback(() => {
		if (recorderRef.current && recorderRef.current.state === "recording") {
			recorderRef.current.stop();
		}
	}, []);

	const canRecord = !!stream && !recording;

	return (
		<div
			className="flex items-center gap-2"
			title="Record from monitor source to selected track"
		>
			<CircleButton
				icon={Mic}
				label={
					canRecord
						? `Record from ${source?.label ?? "monitor"}`
						: "Monitor not ready"
				}
				disabled={!canRecord}
				onClick={startRecording}
				className={recording ? "text-danger-text animate-pulse" : ""}
			/>
			{recording && (
				<CircleButton
					icon={Square}
					label="Stop monitor recording"
					onClick={stopRecording}
				/>
			)}
			{recording && (
				<span className="text-xs text-danger-text font-mono tabular-nums">
					REC {source?.label ?? ""}
				</span>
			)}
		</div>
	);
}
