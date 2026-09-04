import { useCallback, useState } from "react";
import type { IsolationStem } from "@/components/Workspace/VocalIsolationView";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";
import type { StudioTrack } from "../AudioStudioStore";
import { getPeakWaveform } from "./getPeakWaveform";

interface UseStudioIsolationOptions {
	tracks: StudioTrack[];
	selectedTrackIndex: number;
	isolateStem: IsolationStem;
	demucsReady: boolean;
	addTrack: (name?: string) => string;
	updateTrack: (id: string, updates: Partial<StudioTrack>) => void;
	setTrackAudio: (
		id: string,
		url: string,
		file: File | Blob,
		duration: number,
	) => void;
	pushUndo: (label: string) => void;
	audioBuffersRef?: React.RefObject<Map<string, AudioBuffer> | null>;
}

export function useStudioIsolation(opts: UseStudioIsolationOptions) {
	const {
		tracks,
		selectedTrackIndex,
		isolateStem,
		demucsReady,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	} = opts;
	const [isolating, setIsolating] = useState(false);

	const handleIsolate = useCallback(async () => {
		const targetTrack = tracks[selectedTrackIndex];
		if (!targetTrack) {
			return;
		}
		let blob: Blob | null = targetTrack.audioBlob;
		if (!blob && targetTrack.audioUrl) {
			try {
				blob = await (await fetch(targetTrack.audioUrl)).blob();
			} catch {
				blob = null;
			}
		}
		if (!blob) {
			showStudioErrorToast(
				new Error("Selected track has no audio. Record or import first."),
			);
			return;
		}
		if (blob.size > 200 * 1024 * 1024) {
			showStudioErrorToast(
				new Error("File too large for isolation (max 200 MB)."),
			);
			return;
		}
		if (!demucsReady) {
			showStudioErrorToast(
				new Error("Download the Demucs model from the Store first."),
			);
			return;
		}
		setIsolating(true);
		try {
			const { audio_path } = await apiClient.dspUpload(
				blob,
				`${targetTrack.name}.wav`,
			);
			const stemBlob = await apiClient.separateAudio(audio_path, isolateStem);
			const url = URL.createObjectURL(stemBlob);
			const ctx = getSharedContext() ?? new AudioContext();
			const needsClose = ctx !== getSharedContext();
			const audioBuffer = await ctx.decodeAudioData(
				await stemBlob.arrayBuffer(),
			);
			const peaks = getPeakWaveform(audioBuffer, 200);
			if (needsClose) {
				await ctx.close();
			}
			const id = addTrack(
				`${isolateStem[0].toUpperCase()}${isolateStem.slice(1)} (isolated)`,
			);
			if (audioBuffersRef?.current) {
				audioBuffersRef.current.set(id, audioBuffer);
			}
			updateTrack(id, {
				waveformData: peaks,
				channels: audioBuffer.numberOfChannels,
			});
			setTrackAudio(id, url, stemBlob, audioBuffer.duration);
			pushUndo(`Isolate ${isolateStem} from ${targetTrack.name}`);
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setIsolating(false);
		}
	}, [
		tracks,
		selectedTrackIndex,
		isolateStem,
		demucsReady,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	]);

	return { isolating, handleIsolate };
}
