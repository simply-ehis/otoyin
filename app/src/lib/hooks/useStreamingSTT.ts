import { useCallback, useEffect, useRef, useState } from "react";
import type { WhisperModelSize } from "@/lib/api/types";
import { useServerStore } from "@/stores/serverStore";

interface StreamingSTTOptions {
	modelId?: WhisperModelSize;
	language?: string;
	sampleRate?: number;
	chunkIntervalMs?: number;
	vadThreshold?: number;
}

interface ChunkResult {
	text: string;
	is_final: boolean;
	confidence: number;
	energy: number;
	is_loud: boolean;
}

interface UseStreamingSTTReturn {
	transcript: string;
	segments: Array<{ text: string; start_ms: number; end_ms: number }>;
	isListening: boolean;
	error: string | null;
	energy: number;
	isLoud: boolean;
	start: () => Promise<void>;
	stop: () => Promise<{
		full_text: string;
		segments: Array<{ text: string; start_ms: number; end_ms: number }>;
	}>;
	vadThreshold: number;
	setVadThreshold: (threshold: number) => void;
	// Offline fallback
	isOnline: boolean;
	getCachedTranscript: () => string | null;
	clearCache: () => void;
}

export function useStreamingSTT(
	options: StreamingSTTOptions = {},
): UseStreamingSTTReturn {
	const {
		modelId = "base",
		language,
		sampleRate = 16000,
		chunkIntervalMs: _chunkIntervalMs = 200,
		vadThreshold: initialVadThreshold = 0.02,
	} = options;

	const [transcript, setTranscript] = useState("");
	const [segments, setSegments] = useState<
		Array<{ text: string; start_ms: number; end_ms: number }>
	>([]);
	const [isListening, setIsListening] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [energy, setEnergy] = useState(0);
	const [isLoud, setIsLoud] = useState(false);
	const [vadThreshold, setVadThresholdState] = useState(initialVadThreshold);
	const [isOnline, setIsOnline] = useState(true);

	const setVadThreshold = useCallback((threshold: number) => {
		setVadThresholdState(threshold);
	}, []);

	// Cache key for localStorage
	const CACHE_KEY = "Otoyin_streaming_transcript_cache";

	// Load cached transcript on mount
	useEffect(() => {
		const cached = localStorage.getItem(CACHE_KEY);
		if (cached) {
			try {
				const parsed = JSON.parse(cached);
				if (parsed.transcript) {
					setTranscript(parsed.transcript);
				}
				if (parsed.segments) {
					setSegments(parsed.segments);
				}
			} catch {
				// Ignore corrupted cache
			}
		}
	}, []);

	// Save transcript to localStorage whenever it changes
	useEffect(() => {
		if (transcript) {
			localStorage.setItem(
				CACHE_KEY,
				JSON.stringify({
					transcript,
					segments,
					timestamp: Date.now(),
				}),
			);
		}
	}, [transcript, segments]);

	// Online/offline detection
	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		// Initial check
		setIsOnline(navigator.onLine);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	const sessionIdRef = useRef<string | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const processorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(
		null,
	);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const accumulatedRef = useRef("");

	const getBaseUrl = useCallback(() => {
		return useServerStore.getState().serverUrl;
	}, []);

	const sendChunk = useCallback(
		async (audioData: number[]) => {
			const sid = sessionIdRef.current;
			if (!sid) {
				return null;
			}
			try {
				const res = await fetch(`${getBaseUrl()}/stt/stream/chunk`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ session_id: sid, audio: audioData }),
				});
				if (!res.ok) {
					return null;
				}
				const result = (await res.json()) as ChunkResult;
				if (result?.text) {
					accumulatedRef.current +=
						(accumulatedRef.current ? " " : "") + result.text;
					setTranscript(accumulatedRef.current);
					if (result.is_final) {
						accumulatedRef.current = "";
					}
				}
				// Update energy and loudness state for VU meter
				if (result?.energy !== undefined) {
					setEnergy(result.energy);
				}
				if (result?.is_loud !== undefined) {
					setIsLoud(result.is_loud);
				}
				return result;
			} catch {
				return null;
			}
		},
		[getBaseUrl],
	);

	// Shared handler for incoming PCM samples — posts them to the STT endpoint.
	const handlePCM = useCallback(
		(samples: Float32Array) => {
			const pcm = Array.from(samples);
			sendChunk(pcm)
				.then((result) => {
					if (result?.text) {
						accumulatedRef.current +=
							(accumulatedRef.current ? " " : "") + result.text;
						setTranscript(accumulatedRef.current);
						if (result.is_final) {
							accumulatedRef.current = "";
						}
					}
				})
				.catch(() => {
					/* chunk send failed — will retry next interval */
				});
		},
		[sendChunk],
	);

	// Connect a mic source to an AudioWorkletNode (preferred — ScriptProcessorNode
	// is deprecated). Falls back to ScriptProcessorNode if worklet loading fails.
	const wireProcessor = useCallback(
		async (
			ctx: AudioContext,
			source: MediaStreamAudioSourceNode,
		): Promise<AudioWorkletNode | ScriptProcessorNode> => {
			try {
				const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (channel && channel.length > 0) {
			this.port.postMessage(channel.slice(0));
		}
		return true;
	}
}
registerProcessor("pcm-processor", PCMProcessor);
`;
				const blobUrl = URL.createObjectURL(
					new Blob([workletCode], { type: "application/javascript" }),
				);
				await ctx.audioWorklet.addModule(blobUrl);
				URL.revokeObjectURL(blobUrl);

				const node = new AudioWorkletNode(ctx, "pcm-processor");
				node.port.onmessage = (e) => {
					handlePCM(e.data as Float32Array);
				};
				source.connect(node);
				node.connect(ctx.destination);
				return node;
			} catch {
				// Fallback for webviews without AudioWorklet support
				const processor = ctx.createScriptProcessor(4096, 1, 1);
				processor.onaudioprocess = (e) => {
					handlePCM(e.inputBuffer.getChannelData(0));
				};
				source.connect(processor);
				processor.connect(ctx.destination);
				return processor;
			}
		},
		[handlePCM],
	);

	const start = useCallback(async () => {
		setError(null);
		try {
			const sidRes = await fetch(`${getBaseUrl()}/stt/stream/start`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model_id: modelId,
					language,
					sample_rate: sampleRate,
					vad_threshold: vadThreshold,
				}),
			});
			if (!sidRes.ok) {
				throw new Error("Failed to start session");
			}
			const { session_id } = await sidRes.json();
			sessionIdRef.current = session_id;

			const stream = await navigator.mediaDevices.getUserMedia({
				audio: { sampleRate, channelCount: 1, echoCancellation: true },
			});
			streamRef.current = stream;

			const ctx = new AudioContext({ sampleRate });
			audioContextRef.current = ctx;
			const source = ctx.createMediaStreamSource(stream);
			const processor = await wireProcessor(ctx, source);
			processorRef.current = processor;
			setIsListening(true);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			setError(msg);
			throw err;
		}
	}, [modelId, language, sampleRate, getBaseUrl, wireProcessor, vadThreshold]);

	const stop = useCallback(async () => {
		processorRef.current?.disconnect();
		audioContextRef.current?.close();
		streamRef.current?.getTracks().forEach((t) => {
			t.stop();
		});
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
		}

		const sid = sessionIdRef.current;
		if (!sid) {
			setIsListening(false);
			return { full_text: "", segments: [] };
		}
		try {
			const res = await fetch(`${getBaseUrl()}/stt/stream/stop`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ session_id: sid }),
			});
			if (!res.ok) {
				throw new Error("Failed to stop session");
			}
			const data = await res.json();
			setSegments(data.segments);
			setIsListening(false);
			return data;
		} catch (_err) {
			setIsListening(false);
			return { full_text: "", segments: [] };
		}
	}, [getBaseUrl]);

	// Offline cache helpers
	const getCachedTranscript = useCallback((): string | null => {
		try {
			const cached = localStorage.getItem(CACHE_KEY);
			if (cached) {
				const parsed = JSON.parse(cached);
				return parsed.transcript ?? null;
			}
		} catch {
			// ignore
		}
		return null;
	}, []);

	const clearCache = useCallback(() => {
		localStorage.removeItem(CACHE_KEY);
	}, []);

	// Cleanup on unmount — stop mic if still listening
	useEffect(() => {
		return () => {
			processorRef.current?.disconnect();
			audioContextRef.current?.close();
			streamRef.current?.getTracks().forEach((t) => {
				t.stop();
			});
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, []);

	return {
		transcript,
		segments,
		isListening,
		error,
		energy,
		isLoud,
		start,
		stop,
		vadThreshold,
		setVadThreshold,
		isOnline,
		getCachedTranscript,
		clearCache,
	};
}
