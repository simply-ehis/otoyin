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
import { debug } from "@/lib/utils/debug";
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
	pushUndo: (label: string, onUndo?: () => void, onRedo?: () => void) => void;
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

			// Undo must snapshot BEFORE the first mutation (the revoke below
			// is one) and swap the decoded-buffer playback cache back — the
			// cache lives in this ref, so the store snapshot cannot restore it.
			const prevBuffer = audioBuffersRef.current?.get(targetTrack.id) ?? null;
			let importedBuffer: AudioBuffer | null = null;
			pushUndo(
				`Import audio to ${targetTrack.name}`,
				() => {
					if (prevBuffer) {
						audioBuffersRef.current?.set(targetTrack.id, prevBuffer);
					} else {
						audioBuffersRef.current?.delete(targetTrack.id);
					}
				},
				() => {
					if (importedBuffer) {
						audioBuffersRef.current?.set(targetTrack.id, importedBuffer);
					} else {
						audioBuffersRef.current?.delete(targetTrack.id);
					}
				},
			);

			// Revoke previous URL if any
			if (targetTrack.audioUrl?.startsWith("blob:")) {
				try {
					URL.revokeObjectURL(targetTrack.audioUrl);
				} catch (e) {
					debug.warn("revokeObjectURL failed", e);
				}
			}

			const url = URL.createObjectURL(file);
			let duration = 0;
			try {
				duration = await getAudioDuration(file);
			} catch (e) {
				debug.warn("getAudioDuration failed, using decoded duration", e);
				duration = 0;
			}

			try {
				const ctx = getSharedContext() ?? new AudioContext();
				const needsClose = ctx !== getSharedContext();
				const arrayBuffer = await file.arrayBuffer();
				// decodeAudioData detaches the buffer — no copy needed.
				const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
				importedBuffer = audioBuffer;
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
