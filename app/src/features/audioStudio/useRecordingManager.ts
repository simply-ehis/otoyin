import { useCallback, useRef } from "react";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { getAudioDuration } from "@/lib/utils/audio";
import { useToast } from "@/ui/use-toast";
import type { StudioTrack } from "./AudioStudioStore";
import { useAudioStudioStore } from "./AudioStudioStore";
import { getPeakWaveform } from "./getPeakWaveform";

interface UseRecordingManagerOptions {
	tracks: StudioTrack[];
	selectedTrackIndex: number;
	setRecordingTrackIndex: (idx: number | null) => void;
	setIsRecording: (v: boolean) => void;
	updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
	setTrackAudio: (
		id: string,
		url: string,
		blob: Blob,
		duration: number,
	) => void;
	pushUndo: (desc: string) => void;
	audioBuffersRef: React.MutableRefObject<Map<string, AudioBuffer>>;
}

export function useRecordingManager({
	tracks,
	selectedTrackIndex,
	setRecordingTrackIndex,
	setIsRecording,
	updateTrack,
	setTrackAudio,
	pushUndo,
	audioBuffersRef,
}: UseRecordingManagerOptions) {
	const { toast } = useToast();
	const recordingTrackIdRef = useRef<string | null>(null);

	const handleRecordingComplete = useCallback(
		async (blob: Blob, recordedDuration?: number) => {
			const targetTrack = tracks.find(
				(t) => t.id === recordingTrackIdRef.current,
			);
			if (!targetTrack) {
				setIsRecording(false);
				setRecordingTrackIndex(null);
				recordingTrackIdRef.current = null;
				return;
			}

			const url = URL.createObjectURL(blob);
			const duration =
				recordedDuration || (await getAudioDuration(blob as File));

			try {
				const audioCtx = new AudioContext();
				const arrayBuffer = await blob.arrayBuffer();
				const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
				const peaks = getPeakWaveform(audioBuffer, 200);
				await audioCtx.close();
				audioBuffersRef.current.set(targetTrack.id, audioBuffer);
				updateTrack(targetTrack.id, {
					waveformData: peaks,
					channels: audioBuffer.numberOfChannels,
				});
			} catch (err) {
				console.error("Recording decode error:", err);
			}

			setTrackAudio(targetTrack.id, url, blob, duration);
			pushUndo(`Record to ${targetTrack.name}`);
			setRecordingTrackIndex(null);
			setIsRecording(false);
			recordingTrackIdRef.current = null;
			toast({ title: `Recording saved to ${targetTrack.name}` });
		},
		[
			tracks,
			setIsRecording,
			setRecordingTrackIndex,
			updateTrack,
			setTrackAudio,
			pushUndo,
			toast,
			audioBuffersRef,
		],
	);

	const recording = useAudioRecording({
		maxDurationSeconds: 60,
		onRecordingComplete: handleRecordingComplete,
		onRecordingError: () => {
			recordingTrackIdRef.current = null;
			setRecordingTrackIndex(null);
			setIsRecording(false);
			toast({
				title: "Recording failed",
				description: "The microphone recording device reported an error",
				variant: "destructive",
			});
		},
	});

	const handleStartRecording = useCallback(async () => {
		const store = useAudioStudioStore.getState();
		if (store.isRecording || store.tracks.length === 0) {
			return;
		}
		const targetTrack = store.tracks[selectedTrackIndex];
		if (!targetTrack) {
			return;
		}
		setRecordingTrackIndex(selectedTrackIndex);
		recordingTrackIdRef.current = targetTrack.id;
		setIsRecording(true);
		try {
			await recording.startRecording();
		} catch (err) {
			recordingTrackIdRef.current = null;
			setRecordingTrackIndex(null);
			setIsRecording(false);
			toast({
				title: "Recording failed",
				description:
					err instanceof Error ? err.message : "Failed to start recording",
				variant: "destructive",
			});
		}
	}, [
		selectedTrackIndex,
		recording,
		setRecordingTrackIndex,
		setIsRecording,
		toast,
	]);

	const handleStopRecording = useCallback(() => {
		recording.stopRecording();
	}, [recording]);

	return { handleRecordingComplete, handleStartRecording, handleStopRecording };
}
