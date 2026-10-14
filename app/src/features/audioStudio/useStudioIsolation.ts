import { useCallback, useState } from "react";
import type { IsolationStem } from "@/features/workspace/VocalIsolationView";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";
import type { StudioTrack } from "./AudioStudioStore";
import { getPeakWaveform } from "./getPeakWaveform";
import { STEM_WAVEFORM } from "./stemColors";

interface UseStudioIsolationOptions {
	tracks: StudioTrack[];
	selectedTrackIndex: number;
	isolateStem: IsolationStem;
	invert?: boolean;
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
		invert = false,
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
				const res = await fetch(targetTrack.audioUrl);
				if (!res.ok) {
					throw new Error(`Fetch failed: ${res.status}`);
				}
				blob = await res.blob();
			} catch (e) {
				blob = null;
				showStudioErrorToast(
					e instanceof Error
						? e
						: new Error("Failed to load track audio for isolation."),
				);
				return;
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
			const stemBlob = await apiClient.separateAudio(
				audio_path,
				isolateStem,
				"htdemucs",
				invert,
			);
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
			const label = invert
				? `${isolateStem[0].toUpperCase()}${isolateStem.slice(1)} removed`
				: `${isolateStem[0].toUpperCase()}${isolateStem.slice(1)} (isolated)`;
			// Snapshot BEFORE addTrack — the snapshot must capture the
			// timeline without the new stem track.
			pushUndo(
				invert
					? `Remove ${isolateStem} from ${targetTrack.name}`
					: `Isolate ${isolateStem} from ${targetTrack.name}`,
			);
			const id = addTrack(label);
			if (audioBuffersRef?.current) {
				audioBuffersRef.current.set(id, audioBuffer);
			}
			updateTrack(id, {
				waveformData: peaks,
				channels: audioBuffer.numberOfChannels,
				// Tag isolated stems so the track gets stem colors; a
				// "removed" result is a full mix, not a stem.
				...(invert
					? {}
					: { stem: isolateStem, color: STEM_WAVEFORM[isolateStem] }),
			});
			setTrackAudio(id, url, stemBlob, audioBuffer.duration);
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setIsolating(false);
		}
	}, [
		tracks,
		selectedTrackIndex,
		isolateStem,
		invert,
		demucsReady,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	]);

	return { isolating, handleIsolate };
}
