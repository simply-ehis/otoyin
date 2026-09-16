import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";
import { getAudioDuration } from "@/lib/utils/audio";
import { debug } from "@/lib/utils/debug";
import type { StudioTrack } from "./AudioStudioStore";
import { getPeakWaveform } from "./getPeakWaveform";

export type StitchCurve = "equal_power" | "linear" | "exponential";

export interface StitchOptions {
	crossfadeMs: number;
	gapMs: number;
	curve: StitchCurve;
}

interface UseStudioStitchOptions {
	tracks: StudioTrack[];
	selectedTrackIndex: number;
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

const MAX_STITCH_BYTES = 200 * 1024 * 1024;

async function trackToBlob(track: StudioTrack): Promise<Blob> {
	if (track.audioBlob) {
		return track.audioBlob;
	}
	if (!track.audioUrl) {
		throw new Error(
			`Track "${track.name}" has no audio. Record or import first.`,
		);
	}
	const res = await fetch(track.audioUrl);
	if (!res.ok) {
		throw new Error(`Could not load audio for "${track.name}": ${res.status}`);
	}
	return res.blob();
}

/** Stitch two tracks end-to-end via the backend blend route (crossfade + gap + curve). */
export function useStudioStitch(opts: UseStudioStitchOptions) {
	const {
		tracks,
		selectedTrackIndex,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	} = opts;
	const [stitching, setStitching] = useState(false);

	const handleStitch = useCallback(
		async (targetTrackId: string, stitch: StitchOptions): Promise<boolean> => {
			const source = tracks[selectedTrackIndex];
			const target = tracks.find((t) => t.id === targetTrackId);
			if (!source || !target) {
				return false;
			}
			if (source.id === target.id) {
				showStudioErrorToast(
					new Error("Pick a different track to stitch with."),
				);
				return false;
			}
			setStitching(true);
			try {
				const [blobA, blobB] = await Promise.all([
					trackToBlob(source),
					trackToBlob(target),
				]);
				if (blobA.size > MAX_STITCH_BYTES || blobB.size > MAX_STITCH_BYTES) {
					throw new Error("File too large to stitch (max 200 MB per track).");
				}
				const [{ audio_path: pathA }, { audio_path: pathB }] =
					await Promise.all([
						apiClient.dspUpload(blobA, `${source.name}.wav`),
						apiClient.dspUpload(blobB, `${target.name}.wav`),
					]);
				const result = await apiClient.blendAudio(
					pathA,
					pathB,
					stitch.crossfadeMs,
					stitch.gapMs,
					stitch.curve,
				);
				const stitched = await apiClient.fetchExportFile(result.filename);
				const url = URL.createObjectURL(stitched);
				let duration = result.duration_s;
				try {
					duration = await getAudioDuration(stitched as File);
				} catch (e) {
					debug.warn(
						"getAudioDuration failed for stitch, using backend duration",
						e,
					);
				}
				const ctx = getSharedContext() ?? new AudioContext();
				const needsClose = ctx !== getSharedContext();
				try {
					const audioBuffer = await ctx.decodeAudioData(
						await stitched.arrayBuffer(),
					);
					const peaks = getPeakWaveform(audioBuffer, 200);
					const id = addTrack(`${source.name} + ${target.name}`);
					audioBuffersRef?.current?.set(id, audioBuffer);
					updateTrack(id, {
						waveformData: peaks,
						channels: audioBuffer.numberOfChannels,
					});
					if (!duration || !Number.isFinite(duration)) {
						duration = audioBuffer.duration;
					}
					setTrackAudio(id, url, stitched, duration);
					pushUndo(`Stitch ${source.name} + ${target.name}`);
					return true;
				} finally {
					if (needsClose) {
						await ctx.close().catch(() => undefined);
					}
				}
			} catch (error) {
				showStudioErrorToast(error);
				return false;
			} finally {
				setStitching(false);
			}
		},
		[
			tracks,
			selectedTrackIndex,
			addTrack,
			updateTrack,
			setTrackAudio,
			pushUndo,
			audioBuffersRef,
		],
	);

	return { stitching, handleStitch };
}
