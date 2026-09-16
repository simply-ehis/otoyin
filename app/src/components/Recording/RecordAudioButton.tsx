import { MicrophoneIcon, StopIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { Button } from "@/ui/button";

function formatSecs(s: number): string {
	const m = Math.floor(s / 60);
	const r = Math.floor(s % 60);
	return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Visible one-click recorder: mic → timer → stop → auto-upload as a capture
 * and auto-play in the shared player. Mounted in Library + Captures headers
 * so recording is impossible to miss (previously buried in dialogs).
 */
export function RecordAudioButton({ compact = false }: { compact?: boolean }) {
	const qc = useQueryClient();
	const [uploading, setUploading] = useState(false);
	const [lastId, setLastId] = useState<string | null>(null);

	const { isRecording, duration, error, startRecording, stopRecording } =
		useAudioRecording({
			onRecordingComplete: async (blob, recordedSecs) => {
				setUploading(true);
				try {
					const ext = blob.type.includes("mp4")
						? "m4a"
						: blob.type.includes("wav")
							? "wav"
							: "webm";
					const file = new File([blob], `recording-${Date.now()}.${ext}`, {
						type: blob.type || "audio/webm",
					});
					const created = await apiClient.createCapture(file, {
						source: "recording",
					});
					setLastId(created.id ?? null);
					await qc.invalidateQueries({ queryKey: ["library"] });
					await qc.invalidateQueries({ queryKey: ["captures"] });
					// Auto-play the fresh take so "record" visibly did something.
					if (created.id) {
						const url = apiClient.getCaptureAudioUrl(created.id);
						usePlayerStore
							.getState()
							.setAudioWithAutoPlay(url, created.id, null, "New recording");
					}
				} catch (e) {
					showStudioErrorToast(e);
				} finally {
					setUploading(false);
				}
				void recordedSecs;
			},
		});

	if (uploading) {
		return (
			<Button size="sm" variant="outline" disabled className="gap-1.5">
				<span className="size-2 animate-pulse rounded-full bg-accent" />
				Uploading…
			</Button>
		);
	}

	if (isRecording) {
		return (
			<span className="flex items-center gap-2">
				<output
					aria-label={`Recording ${formatSecs(duration)}`}
					className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
				>
					<span className="size-2 animate-pulse rounded-full bg-destructive" />
					{formatSecs(duration)}
				</output>
				<Button
					size="sm"
					variant="destructive"
					onClick={stopRecording}
					title="Stop recording and save"
					aria-label="Stop recording and save"
					className="gap-1.5"
				>
					<StopIcon className="size-3.5" />
					Stop
				</Button>
			</span>
		);
	}

	return (
		<Button
			size="sm"
			variant="outline"
			onClick={() => void startRecording()}
			title={error ?? "Record audio from your microphone"}
			aria-label="Record audio from your microphone"
			className={cn("gap-1.5", error && "border-destructive/40")}
		>
			<MicrophoneIcon className="size-3.5" />
			{compact ? "Record" : "Record audio"}
			{lastId ? <span className="sr-only">(last take saved)</span> : null}
		</Button>
	);
}
