import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useToast } from "@/ui/use-toast";
import type { StudioTrack } from "./AudioStudioStore";
import { useAudioStudioStore } from "./AudioStudioStore";
import { buildEffectChain } from "./buildEffectChain";
import { getPeakWaveform } from "./getPeakWaveform";
import { interpolateAutomation } from "./interpolateAutomation";
import { renderMidiToBuffer } from "./renderMidiToBuffer";

interface UsePlaybackEngineOptions {
	tracks: StudioTrack[];
	masterVolume: number;
	isLooping: boolean;
	playbackSpeed: number;
	audioBuffersRef: React.RefObject<Map<string, AudioBuffer> | null>;
	setIsPlaying: (v: boolean) => void;
	setCurrentTime: (v: number) => void;
	updateTrack: (id: string, updates: Partial<StudioTrack>) => void;
}

export function usePlaybackEngine({
	tracks,
	masterVolume,
	isLooping,
	playbackSpeed,
	audioBuffersRef,
	setIsPlaying,
	setCurrentTime,
	updateTrack,
}: UsePlaybackEngineOptions) {
	const { toast } = useToast();

	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const duckNodeRef = useRef<GainNode | null>(null);
	const duckMeterRef = useRef<AnalyserNode | null>(null);
	const duckDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
	const durationRef = useRef<number>(0);
	const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
	const panNodesRef = useRef<Map<string, StereoPannerNode>>(new Map());
	const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
	const trackAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map());
	const sidechainNodesRef = useRef<
		Map<string, { gain: GainNode; sourceId: string }>
	>(new Map());
	const animFrameRef = useRef<number | null>(null);
	const startTimeRef = useRef<number>(0);
	const [trackAnalysers, setTrackAnalysers] = useState<
		Map<string, AnalyserNode>
	>(new Map());

	const stopPlayback = useCallback(() => {
		if (animFrameRef.current !== null) {
			cancelAnimationFrame(animFrameRef.current);
			animFrameRef.current = null;
		}
		sourceNodesRef.current.forEach((source) => {
			try {
				source.stop();
			} catch {
				debug.log(
					"AudioStudio: source already stopped during playback teardown",
				);
			}
			try {
				source.disconnect();
			} catch {
				// Already disconnected.
			}
		});
		sourceNodesRef.current.clear();
		gainNodesRef.current.forEach((n) => {
			try {
				n.disconnect();
			} catch {
				// Already disconnected.
			}
		});
		gainNodesRef.current.clear();
		panNodesRef.current.forEach((n) => {
			try {
				n.disconnect();
			} catch {
				// Already disconnected.
			}
		});
		panNodesRef.current.clear();
		trackAnalysersRef.current.forEach((n) => {
			try {
				n.disconnect();
			} catch {
				// Already disconnected.
			}
		});
		trackAnalysersRef.current.clear();
		sidechainNodesRef.current.forEach((sc) => {
			try {
				sc.gain.disconnect();
			} catch {
				// Already disconnected.
			}
		});
		sidechainNodesRef.current.clear();
		try {
			analyserRef.current?.disconnect();
		} catch {
			// Already disconnected.
		}
		try {
			duckNodeRef.current?.disconnect();
		} catch {
			// Already disconnected.
		}
		try {
			duckMeterRef.current?.disconnect();
		} catch {
			// Already disconnected.
		}
		const oldAnalyser = analyserRef.current;
		analyserRef.current = null;
		duckNodeRef.current = null;
		duckMeterRef.current = null;
		setTrackAnalysers(new Map());
		setIsPlaying(false);
		if (
			oldAnalyser &&
			usePlayerStore.getState().masterAnalyser === oldAnalyser
		) {
			usePlayerStore.getState().setMasterAnalyser(null);
		}
	}, [setIsPlaying]);

	const startPlayback = useCallback(async () => {
		if (tracks.length === 0 || tracks.every((t) => !t.audioUrl)) {
			toast({
				title: "No audio to play",
				description: "Add audio to at least one track",
			});
			return;
		}

		stopPlayback();

		if (!audioContextRef.current) {
			audioContextRef.current = new AudioContext();
		}
		const ctx = audioContextRef.current;
		if (ctx.state === "suspended") {
			await ctx.resume();
		}

		const masterGain = ctx.createGain();
		masterGain.gain.value = masterVolume;

		const analyser = ctx.createAnalyser();
		analyser.fftSize = 2048;
		analyser.smoothingTimeConstant = 0.8;
		const duckGain = ctx.createGain();
		duckGain.gain.value = 1;
		const duckMeter = ctx.createAnalyser();
		duckMeter.fftSize = 2048;
		duckMeter.smoothingTimeConstant = 0.3;
		masterGain.connect(duckMeter);
		duckMeter.connect(duckGain);
		duckGain.connect(analyser);
		analyser.connect(ctx.destination);
		analyserRef.current = analyser;
		duckNodeRef.current = duckGain;
		duckMeterRef.current = duckMeter;
		duckDataRef.current = new Float32Array(duckMeter.fftSize);
		usePlayerStore.getState().setMasterAnalyser(analyser);

		const hasSolo = tracks.some((t) => t.solo);
		let trackHasAudio = false;
		let maxDuration = 0;

		for (const track of tracks) {
			if (!track.audioUrl && !track.audioBlob && track.midiNotes.length === 0) {
				continue;
			}
			const buffer = audioBuffersRef.current?.get(track.id);
			const dur = buffer ? buffer.duration : track.duration || 1.0;
			const isMuted = hasSolo ? !track.solo : track.muted;
			if (isMuted) {
				continue;
			}

			trackHasAudio = true;
			if (dur > maxDuration) {
				maxDuration = dur;
			}
		}

		if (!trackHasAudio) {
			toast({ title: "No unmuted audio tracks to play" });
			return;
		}

		const startOffset = Math.max(
			0,
			Math.min(
				useAudioStudioStore.getState().currentTimeRef.current || 0,
				maxDuration,
			),
		);

		const xfadeIn = new Map<string, number>();
		tracks.forEach((t) => {
			if (t.crossfade?.targetTrackId) {
				xfadeIn.set(t.crossfade.targetTrackId, t.crossfade.durationMs);
			}
		});

		for (const track of tracks) {
			if (!track.audioUrl && !track.audioBlob && track.midiNotes.length === 0) {
				continue;
			}
			let buffer: AudioBuffer | null =
				audioBuffersRef.current?.get(track.id) ?? null;
			if (!buffer && track.midiNotes.length > 0) {
				buffer = await renderMidiToBuffer(
					ctx,
					track.midiNotes,
					track.duration || 1.0,
				);
				if (buffer) {
					audioBuffersRef.current?.set(track.id, buffer);
					updateTrack(track.id, {
						waveformData: getPeakWaveform(buffer, 200),
						channels: buffer.numberOfChannels,
					});
				}
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
			source.playbackRate.value = playbackSpeed;

			const trackGain = ctx.createGain();
			trackGain.gain.value = track.volume;

			const crossfadeGain = ctx.createGain();
			crossfadeGain.gain.value = 1;
			const xfOut = track.crossfade?.durationMs ?? 0;
			if (xfOut > 0) {
				const xf = xfOut / 1000;
				crossfadeGain.gain.setValueAtTime(1, Math.max(0, buffer.duration - xf));
				crossfadeGain.gain.linearRampToValueAtTime(0.0001, buffer.duration);
			}
			if (xfadeIn.has(track.id)) {
				const xf = (xfadeIn.get(track.id) || 0) / 1000;
				crossfadeGain.gain.setValueAtTime(0.0001, 0);
				crossfadeGain.gain.linearRampToValueAtTime(1, xf);
			}

			source.connect(trackGain);
			trackGain.connect(crossfadeGain);

			const effectChain = buildEffectChain(ctx, track.pluginChain);
			let nodeBeforePanner: AudioNode = crossfadeGain;
			if (effectChain) {
				crossfadeGain.connect(effectChain.input);
				nodeBeforePanner = effectChain.output;
			}

			const ch = buffer.numberOfChannels;
			const trackAnalyser = ctx.createAnalyser();
			trackAnalyser.fftSize = 2048;
			trackAnalyser.smoothingTimeConstant = 0.8;
			trackAnalysersRef.current.set(track.id, trackAnalyser);

			// Sidechain: insert a gain node that gets modulated by source track level
			let postAnalyserNode: AudioNode = trackAnalyser;
			if (track.sidechainSourceId) {
				const sidechainGain = ctx.createGain();
				sidechainGain.gain.value = 1;
				sidechainNodesRef.current.set(track.id, {
					gain: sidechainGain,
					sourceId: track.sidechainSourceId,
				});
				trackAnalyser.connect(sidechainGain);
				postAnalyserNode = sidechainGain;
			}

			if (ch <= 2) {
				const panner = ctx.createStereoPanner();
				panner.pan.value = track.pan;
				nodeBeforePanner.connect(panner);
				panner.connect(trackAnalyser);
				postAnalyserNode.connect(masterGain);
				panNodesRef.current.set(track.id, panner);
			} else {
				nodeBeforePanner.connect(trackAnalyser);
				postAnalyserNode.connect(masterGain);
			}

			source.loop = isLooping;
			const safeOffset =
				Number.isFinite(startOffset) && startOffset >= 0
					? Math.min(startOffset, Math.max(0, buffer.duration - 0.01))
					: 0;
			try {
				source.start(0, safeOffset);
			} catch {
				try {
					source.start();
				} catch {
					continue;
				}
			}
			sourceNodesRef.current.set(track.id, source);
			gainNodesRef.current.set(track.id, trackGain);
		}

		setTrackAnalysers(new Map(trackAnalysersRef.current));
		startTimeRef.current = ctx.currentTime - startOffset;
		durationRef.current = maxDuration;
		setIsPlaying(true);

		const updateTime = () => {
			if (!audioContextRef.current) {
				return;
			}
			const elapsed =
				audioContextRef.current.currentTime - startTimeRef.current;
			if (elapsed >= maxDuration) {
				if (useAudioStudioStore.getState().isLooping) {
					startTimeRef.current = audioContextRef.current.currentTime;
					setCurrentTime(0);
					animFrameRef.current = requestAnimationFrame(updateTime);
				} else {
					setCurrentTime(maxDuration);
					setIsPlaying(false);
				}
				return;
			}
			setCurrentTime(elapsed);
			const duckMeter = duckMeterRef.current;
			const duckNode = duckNodeRef.current;
			if (duckMeter && duckNode) {
				let data = duckDataRef.current;
				if (!data || data.length !== duckMeter.fftSize) {
					data = new Float32Array(duckMeter.fftSize);
					duckDataRef.current = data;
				}
				duckMeter.getFloatTimeDomainData(data);
				let sum = 0;
				for (let i = 0; i < data.length; i++) {
					sum += data[i] * data[i];
				}
				const rms = Math.sqrt(sum / data.length);
				const db = 20 * Math.log10(Math.max(rms, 0.0001));
				const mc = useAudioStudioStore.getState().masterChannel;
				const target =
					mc.duckingEnabled && db > mc.duckThreshold
						? 10 ** (mc.duckGain / 20)
						: 1;
				const cur = duckNode.gain.value;
				const coef = target < cur ? 0.3 : 0.02;
				duckNode.gain.value = cur + (target - cur) * coef;
			}
			// Sidechain modulation
			sidechainNodesRef.current.forEach((sc, _targetId) => {
				const sourceAnalyser = trackAnalysersRef.current.get(sc.sourceId);
				if (!sourceAnalyser) {
					return;
				}
				const sd = new Float32Array(sourceAnalyser.fftSize);
				sourceAnalyser.getFloatTimeDomainData(sd);
				let ssum = 0;
				for (let i = 0; i < sd.length; i++) {
					ssum += sd[i] * sd[i];
				}
				const srms = Math.sqrt(ssum / sd.length);
				const sdb = 20 * Math.log10(Math.max(srms, 0.0001));
				// Duck target when source exceeds -30dB threshold
				const sidechainTarget = sdb > -30 ? 0.3 + (sdb + 30) * 0.02 : 1;
				const clamped = Math.max(0.1, Math.min(1, sidechainTarget));
				sc.gain.gain.value = clamped;
			});
			for (const track of tracks) {
				const gainNode = gainNodesRef.current.get(track.id);
				if (gainNode) {
					const v = interpolateAutomation(track.volumeAutomation, elapsed);
					if (v !== null) {
						gainNode.gain.value = v;
					}
				}
				const panNode = panNodesRef.current.get(track.id);
				if (panNode) {
					const p = interpolateAutomation(track.panAutomation, elapsed);
					if (p !== null) {
						panNode.pan.value = p;
					}
				}
			}
			animFrameRef.current = requestAnimationFrame(updateTime);
		};
		animFrameRef.current = requestAnimationFrame(updateTime);
	}, [
		tracks,
		masterVolume,
		isLooping,
		stopPlayback,
		setIsPlaying,
		setCurrentTime,
		updateTrack,
		toast,
		playbackSpeed,
		audioBuffersRef,
	]);

	const togglePlayPause = useCallback(() => {
		if (useAudioStudioStore.getState().isPlaying) {
			stopPlayback();
		} else {
			startPlayback();
		}
	}, [stopPlayback, startPlayback]);

	// Live speed: apply slider changes to running sources without restart.
	useEffect(() => {
		sourceNodesRef.current.forEach((s) => {
			try {
				s.playbackRate.value = playbackSpeed;
			} catch {
				// Source already stopped.
			}
		});
	}, [playbackSpeed]);

	const seekTo = useCallback(
		(time: number) => {
			setCurrentTime(time);
			if (useAudioStudioStore.getState().isPlaying) {
				startPlayback();
			}
		},
		[setCurrentTime, startPlayback],
	);

	useEffect(() => {
		return () => {
			if (animFrameRef.current !== null) {
				cancelAnimationFrame(animFrameRef.current);
			}
			sourceNodesRef.current.forEach((source) => {
				try {
					source.stop();
				} catch {
					debug.log(
						"AudioStudio: source already stopped during unmount cleanup",
					);
				}
			});
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, []);

	return {
		startPlayback,
		stopPlayback,
		togglePlayPause,
		seekTo,
		audioContextRef,
		analyserRef,
		durationRef,
		sourceNodesRef,
		gainNodesRef,
		panNodesRef,
		trackAnalysers,
	};
}

import { debug } from "@/lib/utils/debug";
