import { useCallback, useRef, useState } from "react";

export interface StreamingAudioPlayerState {
	isPlaying: boolean;
	isLoading: boolean;
	error: string | null;
}

/**
 * Hook for playing streamed audio chunks via Web Audio API.
 *
 * Usage:
 *   const player = useStreamingAudioPlayer();
 *   player.playChunk(audio, sampleRate, isFinal);
 *   player.stop();
 */
export function useStreamingAudioPlayer() {
	const [state, setState] = useState<StreamingAudioPlayerState>({
		isPlaying: false,
		isLoading: false,
		error: null,
	});

	const audioContextRef = useRef<AudioContext | null>(null);
	const nextStartTimeRef = useRef<number>(0);
	const gainNodeRef = useRef<GainNode | null>(null);
	const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

	const ensureContext = useCallback(() => {
		if (!audioContextRef.current) {
			audioContextRef.current = new AudioContext();
			gainNodeRef.current = audioContextRef.current.createGain();
			gainNodeRef.current.connect(audioContextRef.current.destination);
		}
		return audioContextRef.current;
	}, []);

	const playChunk = useCallback(
		(audio: Float32Array, sampleRate: number, _isFinal: boolean) => {
			const ctx = ensureContext();
			if (ctx.state === "suspended") {
				void ctx.resume();
			}

			const buffer = ctx.createBuffer(1, audio.length, sampleRate);
			buffer.copyToChannel(audio as unknown as Float32Array<ArrayBuffer>, 0);

			const source = ctx.createBufferSource();
			source.buffer = buffer;
			if (gainNodeRef.current) {
				source.connect(gainNodeRef.current);
			}

			const now = ctx.currentTime;
			const startTime = Math.max(now, nextStartTimeRef.current);
			source.start(startTime);
			nextStartTimeRef.current = startTime + buffer.duration;

			activeSourcesRef.current.push(source);
			source.onended = () => {
				activeSourcesRef.current = activeSourcesRef.current.filter(
					(s) => s !== source,
				);
				if (activeSourcesRef.current.length === 0) {
					setState((prev) => ({ ...prev, isPlaying: false }));
				}
			};

			setState((prev) => ({
				...prev,
				isPlaying: true,
				isLoading: false,
				error: null,
			}));
		},
		[ensureContext],
	);

	const stop = useCallback(() => {
		for (const source of activeSourcesRef.current) {
			try {
				source.stop();
			} catch {
				// Already stopped
			}
		}
		activeSourcesRef.current = [];
		nextStartTimeRef.current = 0;
		setState({ isPlaying: false, isLoading: false, error: null });
	}, []);

	const reset = useCallback(() => {
		stop();
		if (audioContextRef.current) {
			void audioContextRef.current.close();
			audioContextRef.current = null;
			gainNodeRef.current = null;
		}
		nextStartTimeRef.current = 0;
	}, [stop]);

	return {
		state,
		playChunk,
		stop,
		reset,
	};
}
