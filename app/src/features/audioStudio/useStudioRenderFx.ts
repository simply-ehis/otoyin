import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { getSharedContext } from "@/lib/hooks/useAudioPlayer";
import { getAudioDuration } from "@/lib/utils/audio";
import { debug } from "@/lib/utils/debug";
import { useToast } from "@/ui/use-toast";
import type { StudioTrack } from "./AudioStudioStore";
import { toBackendChain } from "./effectChainAdapter";
import { getPeakWaveform } from "./getPeakWaveform";

interface UseStudioRenderFxOptions {
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

/**
 * Render the selected track's plugin chain through the backend
 * (/audio/effect-chain) onto a NEW track, preserving the original.
 * Unlike offline bounce, this covers render-only effects (vocoder,
 * auto-tune, de-esser, …). Frontend-only entries (gain) are skipped.
 */
export function useStudioRenderFx(opts: UseStudioRenderFxOptions) {
	const {
		tracks,
		selectedTrackIndex,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	} = opts;
	const [rendering, setRendering] = useState(false);
	const { toast } = useToast();

	const handleRenderFx = useCallback(async (): Promise<boolean> => {
		const source = tracks[selectedTrackIndex];
		if (!source) {
			return false;
		}
		const blob = source.audioBlob;
		if (!blob && !source.audioUrl) {
			showStudioErrorToast(
				new Error("Selected track has no audio. Record or import first."),
			);
			return false;
		}
		const { chain, skipped } = toBackendChain(source.pluginChain ?? []);
		if (chain.length === 0) {
			showStudioErrorToast(
				new Error(
					skipped.length > 0
						? `Nothing to render — ${skipped.join(", ")} ${skipped.length === 1 ? "has" : "have"} no backend equivalent.`
						: "The chain has no enabled effects to render.",
				),
			);
			return false;
		}
		setRendering(true);
		try {
			let input: Blob | null = blob;
			if (!input && source.audioUrl) {
				const res = await fetch(source.audioUrl);
				if (!res.ok) {
					throw new Error(`Could not load track audio: ${res.status}`);
				}
				input = await res.blob();
			}
			if (!input) {
				throw new Error("Selected track has no audio.");
			}
			const { audio_path } = await apiClient.dspUpload(
				input,
				`${source.name}.wav`,
			);
			const result = await apiClient.applyEffectChain(audio_path, chain);
			const rendered = await apiClient.fetchExportFile(result.filename);
			const url = URL.createObjectURL(rendered);
			let duration = 0;
			try {
				duration = await getAudioDuration(rendered as File);
			} catch (e) {
				debug.warn(
					"getAudioDuration failed for render, using decoded duration",
					e,
				);
			}
			const ctx = getSharedContext() ?? new AudioContext();
			const needsClose = ctx !== getSharedContext();
			try {
				const audioBuffer = await ctx.decodeAudioData(
					await rendered.arrayBuffer(),
				);
				const peaks = getPeakWaveform(audioBuffer, 200);
				const label = `${source.name} (rendered)`;
				// Snapshot BEFORE addTrack so undo drops the rendered track.
				pushUndo(label);
				const id = addTrack(label);
				audioBuffersRef?.current?.set(id, audioBuffer);
				updateTrack(id, {
					waveformData: peaks,
					channels: audioBuffer.numberOfChannels,
				});
				if (!duration || !Number.isFinite(duration)) {
					duration = audioBuffer.duration;
				}
				setTrackAudio(id, url, rendered, duration);
				if (skipped.length > 0) {
					toast({
						title: "Rendered with skips",
						description: `${skipped.join(", ")} ${skipped.length === 1 ? "has" : "have"} no backend equivalent — kept on the original track.`,
					});
				} else {
					toast({ title: `Rendered FX on ${source.name}` });
				}
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
			setRendering(false);
		}
	}, [
		tracks,
		selectedTrackIndex,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
		toast,
	]);

	return { rendering, handleRenderFx };
}
