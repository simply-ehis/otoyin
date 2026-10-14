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
	pushUndo: (label: string, onUndo?: () => void, onRedo?: () => void) => void;
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

			// Undo restores the pre-bounce track metadata via the snapshot but
			// cannot reach the decoded-buffer cache (it lives in this ref) —
			// swap it back explicitly, or playback keeps the bounced audio.
			const prevBuffer = audioBuffersRef.current?.get(track.id) ?? null;
			pushUndo(
				`Bounce ${track.name}`,
				() => {
					if (prevBuffer) {
						audioBuffersRef.current?.set(track.id, prevBuffer);
					} else {
						audioBuffersRef.current?.delete(track.id);
					}
				},
				() => {
					audioBuffersRef.current?.set(track.id, rendered);
				},
			);
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
