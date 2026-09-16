import { useCallback, useState } from "react";
import { showStudioErrorToast } from "@/lib/errors";
import type { StudioTrack } from "./AudioStudioStore";
import { audioBufferToWav } from "./audioBufferToWav";
import { buildEffectChain } from "./buildEffectChain";
import { getPeakWaveform } from "./getPeakWaveform";

interface UseBounceTrackOptions {
	tracks: StudioTrack[];
	selectedTrackIndex: number;
	audioBuffersRef: React.RefObject<Map<string, AudioBuffer> | null>;
	setTrackAudio: (
		id: string,
		url: string,
		file: Blob,
		duration: number,
	) => void;
	updateTrack: (id: string, updates: Partial<StudioTrack>) => void;
	pushUndo: (label: string) => void;
}

export function useBounceTrack(opts: UseBounceTrackOptions) {
	const {
		tracks,
		selectedTrackIndex,
		audioBuffersRef,
		setTrackAudio,
		updateTrack,
		pushUndo,
	} = opts;
	const [bouncing, setBouncing] = useState(false);

	const handleBounce = useCallback(async () => {
		const track = tracks[selectedTrackIndex];
		if (!track?.audioUrl) {
			return;
		}
		const buffer = audioBuffersRef.current?.get(track.id);
		if (!buffer) {
			showStudioErrorToast(new Error("No decoded audio for this track"));
			return;
		}
		if (!track.pluginChain.some((p) => p.enabled)) {
			return;
		}

		setBouncing(true);
		try {
			const offCtx = new OfflineAudioContext(
				buffer.numberOfChannels,
				buffer.length,
				buffer.sampleRate,
			);

			const source = offCtx.createBufferSource();
			source.buffer = buffer;

			const chain = buildEffectChain(offCtx, track.pluginChain);
			if (chain) {
				source.connect(chain.input);
				chain.output.connect(offCtx.destination);
			} else {
				source.connect(offCtx.destination);
			}
			source.start(0);

			const rendered = await offCtx.startRendering();
			const wavData = audioBufferToWav(rendered);
			const blob = new Blob([wavData], { type: "audio/wav" });
			const url = URL.createObjectURL(blob);

			pushUndo(`Bounce ${track.name}`);
			setTrackAudio(track.id, url, blob, rendered.duration);
			updateTrack(track.id, {
				pluginChain: [],
				waveformData: getPeakWaveform(rendered, 200),
				channels: rendered.numberOfChannels,
			});

			// Store the new buffer so playback uses the bounced version
			audioBuffersRef.current?.set(track.id, rendered);
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setBouncing(false);
		}
	}, [
		tracks,
		selectedTrackIndex,
		audioBuffersRef,
		setTrackAudio,
		updateTrack,
		pushUndo,
	]);

	return { handleBounce, bouncing };
}
