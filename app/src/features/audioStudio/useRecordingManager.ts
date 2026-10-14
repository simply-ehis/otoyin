import { useCallback, useRef } from "react";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { getAudioDuration } from "@/lib/utils/audio";
import { debug } from "@/lib/utils/debug";
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
	pushUndo: (desc: string, onUndo?: () => void, onRedo?: () => void) => void;
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
			// Monitor path never sets recordingTrackIdRef (only the mic path
			// does) — fall back to the selected track instead of discarding
			// the take silently.
			const targetTrack =
				tracks.find((t) => t.id === recordingTrackIdRef.current) ??
				tracks[selectedTrackIndex] ??
				tracks[0];
			if (!targetTrack) {
				setIsRecording(false);
				setRecordingTrackIndex(null);
				recordingTrackIdRef.current = null;
				toast({
					title: "Recording dropped",
					description: "No track available — add a track and record again.",
					variant: "destructive",
				});
				return;
			}

			// Undo must snapshot BEFORE the first mutation and swap the
			// decoded-buffer playback cache back — the cache lives in this
			// ref, so the store snapshot cannot restore it.
			const prevBuffer = audioBuffersRef.current.get(targetTrack.id) ?? null;
			let recordedBuffer: AudioBuffer | null = null;
			pushUndo(
				`Record to ${targetTrack.name}`,
				() => {
					if (prevBuffer) {
						audioBuffersRef.current.set(targetTrack.id, prevBuffer);
					} else {
						audioBuffersRef.current.delete(targetTrack.id);
					}
				},
				() => {
					if (recordedBuffer) {
						audioBuffersRef.current.set(targetTrack.id, recordedBuffer);
					} else {
						audioBuffersRef.current.delete(targetTrack.id);
					}
				},
			);

			const url = URL.createObjectURL(blob);
			let duration = recordedDuration || 0;
			try {
				if (!duration) {
					duration = await getAudioDuration(blob as File);
				}
			} catch (e) {
				debug.warn("getAudioDuration failed for take, using fallback", e);
				duration = recordedDuration || 0;
			}

			const audioCtx = new AudioContext();
			try {
				const arrayBuffer = await blob.arrayBuffer();
				const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
				recordedBuffer = audioBuffer;
				const peaks = getPeakWaveform(audioBuffer, 200);
				audioBuffersRef.current.set(targetTrack.id, audioBuffer);
				updateTrack(targetTrack.id, {
					waveformData: peaks,
					channels: audioBuffer.numberOfChannels,
				});
			} catch {
				toast({
					title: "Take kept, waveform unavailable",
					description:
						"The recording was saved but could not be decoded for display.",
					variant: "destructive",
				});
			} finally {
				await audioCtx.close().catch(() => undefined);
			}

			setTrackAudio(targetTrack.id, url, blob, duration);
			setRecordingTrackIndex(null);
			setIsRecording(false);
			recordingTrackIdRef.current = null;
			toast({ title: `Recording saved to ${targetTrack.name}` });
		},
		[
			tracks,
			selectedTrackIndex,
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
