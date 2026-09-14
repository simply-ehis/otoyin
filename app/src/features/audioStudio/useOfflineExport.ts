import { useCallback } from "react";
import { showStudioErrorToast } from "@/lib/errors";
import { useToast } from "@/ui/use-toast";
import type { StudioTrack } from "./AudioStudioStore";
import { useAudioStudioStore } from "./AudioStudioStore";
import { applyDuckEnvelope } from "./applyDuckEnvelope";
import { audioBufferToWav } from "./audioBufferToWav";
import { automationCurve } from "./automationCurve";
import { buildEffectChain } from "./buildEffectChain";
import { renderMidiToBuffer } from "./renderMidiToBuffer";

export function useOfflineExport(
	audioBuffersRef: React.RefObject<Map<string, AudioBuffer> | null>,
) {
	const { toast } = useToast();

	const handleExport = useCallback(
		async (tracks: StudioTrack[], masterVolume: number): Promise<boolean> => {
			const buffers = audioBuffersRef.current;
			try {
				const activeTracks = tracks.filter(
					(t) => t.audioUrl || t.audioBlob || t.midiNotes.length > 0,
				);
				if (activeTracks.length === 0) {
					toast({
						title: "Nothing to export",
						description: "No tracks with audio or MIDI content",
					});
					return false;
				}

				const hasSolo = tracks.some((t) => t.solo);
				const xfadeIn = new Map<string, number>();
				tracks.forEach((t) => {
					if (t.crossfade?.targetTrackId) {
						xfadeIn.set(t.crossfade.targetTrackId, t.crossfade.durationMs);
					}
				});

				const maxDuration = tracks.reduce(
					(m, t) => Math.max(m, t.duration || 1.0),
					0,
				);
				const maxCh = Math.max(
					2,
					...tracks.map((t) => {
						const b = buffers?.get(t.id);
						return b ? b.numberOfChannels : 2;
					}),
				);
				const ctx = new OfflineAudioContext(
					maxCh,
					Math.max(1, Math.ceil(maxDuration * 44100)),
					44100,
				);

				const masterGainNode = ctx.createGain();
				masterGainNode.gain.value = masterVolume;
				masterGainNode.connect(ctx.destination);

				for (const track of tracks) {
					if (
						!track.audioUrl &&
						!track.audioBlob &&
						track.midiNotes.length === 0
					) {
						continue;
					}
					let buffer: AudioBuffer | null = buffers?.get(track.id) ?? null;
					if (!buffer && track.midiNotes.length > 0) {
						buffer = await renderMidiToBuffer(
							ctx,
							track.midiNotes,
							track.duration || 1.0,
						);
					}
					if (!buffer) {
						continue;
					}

					const isMuted = hasSolo ? !track.solo : track.muted;
					if (isMuted) {
						continue;
					}

					const source = ctx.createBufferSource();
					source.buffer = buffer;

					const gain = ctx.createGain();
					const n = buffer.length;
					const sr = ctx.sampleRate;
					const dur = buffer.duration;
					const volCurve = automationCurve(
						track.volumeAutomation,
						n,
						sr,
						track.volume,
					);
					const xfOut = (track.crossfade?.durationMs ?? 0) / 1000;
					if (xfOut > 0) {
						const k = Math.floor(xfOut * sr);
						for (let i = n - k; i < n; i++) {
							volCurve[i] *= Math.sqrt(Math.max(0, (n - i) / k));
						}
					}
					if (xfadeIn.has(track.id)) {
						const xf = (xfadeIn.get(track.id) || 0) / 1000;
						const k = Math.floor(xf * sr);
						for (let i = 0; i < k; i++) {
							volCurve[i] *= Math.sqrt(i / k);
						}
					}
					gain.gain.setValueCurveAtTime(volCurve, 0, dur);

					source.connect(gain);
					const effectChain = buildEffectChain(ctx, track.pluginChain);
					let nodeBeforePanner: AudioNode = gain;
					if (effectChain) {
						gain.connect(effectChain.input);
						nodeBeforePanner = effectChain.output;
					}
					const ch = buffer.numberOfChannels;
					if (ch <= 2) {
						const panner = ctx.createStereoPanner();
						const panCurve = automationCurve(
							track.panAutomation,
							n,
							sr,
							track.pan,
						);
						panner.pan.setValueCurveAtTime(panCurve, 0, dur);
						nodeBeforePanner.connect(panner);
						panner.connect(masterGainNode);
					} else {
						nodeBeforePanner.connect(masterGainNode);
					}
					source.start(0);
				}

				const renderedBuffer = await ctx.startRendering();

				const mc = useAudioStudioStore.getState().masterChannel;
				if (mc.duckingEnabled) {
					applyDuckEnvelope(renderedBuffer, mc.duckThreshold, mc.duckGain);
				}

				const wavData = audioBufferToWav(renderedBuffer);
				const blob = new Blob([wavData], { type: "audio/wav" });
				const url = URL.createObjectURL(blob);
				const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				const a = document.createElement("a");
				a.href = url;
				a.download = `audio-studio-export-${stamp}.wav`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);

				toast({
					title: "Export complete",
					description: "Mixed audio downloaded",
				});
				return true;
			} catch (err) {
				showStudioErrorToast(err);
				return false;
			}
		},
		[toast, audioBuffersRef],
	);

	return { handleExport };
}
