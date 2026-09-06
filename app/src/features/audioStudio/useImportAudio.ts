import { useCallback } from "react";
import {
	ACCEPTED_AUDIO_EXTENSIONS,
	formatFileSize,
	IMPORT_AUDIO_MAX_FILE_SIZE,
	isAcceptedAudioExtension,
	isAcceptedAudioMimeType,
} from "@/lib/constants/audio";
import { showStudioErrorToast } from "@/lib/errors";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";
import { getAudioDuration } from "@/lib/utils/audio";
import type { StudioTrack } from "./AudioStudioStore";
import { getPeakWaveform } from "./getPeakWaveform";

interface UseImportAudioOptions {
	selectedTrackIndex: number;
	tracks: StudioTrack[];
	audioBuffersRef: React.RefObject<Map<string, AudioBuffer> | null>;
	updateTrack: (id: string, updates: Partial<StudioTrack>) => void;
	setTrackAudio: (
		id: string,
		url: string,
		file: File | Blob,
		duration: number,
	) => void;
	pushUndo: (label: string) => void;
}

export function useImportAudio(opts: UseImportAudioOptions) {
	const {
		selectedTrackIndex,
		tracks,
		audioBuffersRef,
		updateTrack,
		setTrackAudio,
		pushUndo,
	} = opts;

	return useCallback(async () => {
		const fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.accept = ACCEPTED_AUDIO_EXTENSIONS.join(",");
		fileInput.onchange = async () => {
			const file = fileInput.files?.[0];
			if (!file) {
				return;
			}
			// Validate format and size before decoding
			if (
				!isAcceptedAudioMimeType(file.type) &&
				!isAcceptedAudioExtension(file.name)
			) {
				showStudioErrorToast(
					new Error(
						`Unsupported format. Accepted: ${ACCEPTED_AUDIO_EXTENSIONS.join(", ")}`,
					),
				);
				return;
			}
			if (file.size > IMPORT_AUDIO_MAX_FILE_SIZE) {
				showStudioErrorToast(
					new Error(
						`File too large. Max ${formatFileSize(IMPORT_AUDIO_MAX_FILE_SIZE)}`,
					),
				);
				return;
			}
			const idx = selectedTrackIndex;
			if (idx < 0 || idx >= tracks.length) {
				return;
			}
			const targetTrack = tracks[idx];
			if (!targetTrack) {
				return;
			}

			// Revoke previous URL if any
			if (targetTrack.audioUrl?.startsWith("blob:")) {
				try {
					URL.revokeObjectURL(targetTrack.audioUrl);
				} catch {}
			}

			const url = URL.createObjectURL(file);
			let duration = 0;
			try {
				duration = await getAudioDuration(file);
			} catch {
				duration = 0;
			}

			try {
				const ctx = getSharedContext() ?? new AudioContext();
				const needsClose = ctx !== getSharedContext();
				const arrayBuffer = await file.arrayBuffer();
				// Copy buffer because decodeAudioData may detach
				const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
				const peaks = getPeakWaveform(audioBuffer, 200);
				if (needsClose) {
					await ctx.close();
				}
				audioBuffersRef.current?.set(targetTrack.id, audioBuffer);
				updateTrack(targetTrack.id, {
					waveformData: peaks,
					channels: audioBuffer.numberOfChannels,
				});
				// Use decoded duration if getAudioDuration failed
				if (!duration || !Number.isFinite(duration)) {
					duration = audioBuffer.duration;
				}
			} catch (err) {
				showStudioErrorToast(err);
				// Still set track audio even if waveform fails
			}

			setTrackAudio(targetTrack.id, url, file, duration);
			pushUndo(`Import audio to ${targetTrack.name}`);
		};
		fileInput.click();
	}, [
		selectedTrackIndex,
		tracks,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	]);
}
