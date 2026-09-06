import { MicrophoneIcon, StopIcon } from "@heroicons/react/24/outline";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { Button } from "@/ui/button";

/**
 * One-button mic take recorder: records (native sidecar first, webview
 * fallback) and downloads the take as a timestamped WAV the user keeps.
 * Drop-in wherever a tab needs "record something right here" without
 * owning recording state — instruments, effects try-outs, quick memos.
 */
export function RecordTakeButton({
	filenameBase,
	label = "Record a take",
	className,
}: {
	filenameBase: string;
	label?: string;
	className?: string;
}) {
	const recording = useAudioRecording({
		onRecordingComplete: (blob) => {
			const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${filenameBase}-${stamp}.wav`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		},
		onRecordingError: () =>
			showStudioErrorToast(
				new Error("Recording failed — is a microphone available?"),
			),
	});

	if (recording.error) {
		return (
			<p role="alert" className="text-xs text-destructive">
				{recording.error}
			</p>
		);
	}

	if (recording.isRecording) {
		return (
			<Button
				type="button"
				size="sm"
				variant="destructive"
				onClick={() => recording.stopRecording()}
				title="Stop and keep the take"
				aria-label={`Stop recording (${recording.duration.toFixed(1)} seconds)`}
				className={className}
			>
				<StopIcon className="size-4" aria-hidden="true" />
				Stop · {recording.duration.toFixed(1)}s
			</Button>
		);
	}

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			onClick={() => void recording.startRecording()}
			title={label}
			aria-label={label}
			className={className}
		>
			<MicrophoneIcon className="size-4" aria-hidden="true" />
			{label}
		</Button>
	);
}
