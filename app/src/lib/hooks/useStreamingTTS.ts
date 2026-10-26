import { useCallback, useRef, useState } from "react";
import { showStudioErrorToast } from "@/lib/errors";
import { useStreamingAudioPlayer } from "@/lib/hooks/useStreamingAudioPlayer";
import { streamTts } from "@/lib/streamingTts";

interface UseStreamingTTSOptions {
	engine?: string;
	voicePrompt?: Record<string, unknown>;
	language?: string;
	seed?: number;
	onComplete?: (result?: { audioPath?: string; generationId?: string }) => void;
	onError?: (error: string) => void;
}

interface UseStreamingTTSReturn {
	isPlaying: boolean;
	isLoading: boolean;
	error: string | null;
	audioPath: string | null;
	generationId: string | null;
	start: (text: string) => void;
	stop: () => void;
}

/**
 * Hook for streaming TTS playback via the /tts/stream SSE endpoint.
 *
 * Decodes base64 PCM chunks as they arrive and plays them through the
 * Web Audio API streaming player. On completion, exposes the saved
 * audio_path/generation_id so the result can be replayed.
 *
 * Usage:
 *   const tts = useStreamingTTS({ engine: "kokoro", voicePrompt: { kokoro_voice: "af_heart" } });
 *   tts.start("Hello world");
 *   tts.stop();
 */
export function useStreamingTTS(
	options: UseStreamingTTSOptions = {},
): UseStreamingTTSReturn {
	const {
		engine = "kokoro",
		voicePrompt = {},
		language = "en",
		seed,
		onComplete,
		onError,
	} = options;

	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [audioPath, setAudioPath] = useState<string | null>(null);
	const [generationId, setGenerationId] = useState<string | null>(null);

	const {
		state: playerState,
		playChunk,
		stop: stopPlayer,
	} = useStreamingAudioPlayer();

	const abortRef = useRef<(() => void) | null>(null);

	const stop = useCallback(() => {
		if (abortRef.current) {
			abortRef.current();
			abortRef.current = null;
		}
		stopPlayer();
		setIsLoading(false);
		setError(null);
	}, [stopPlayer]);

	const start = useCallback(
		(text: string) => {
			stop();

			setError(null);
			setIsLoading(true);
			setAudioPath(null);
			setGenerationId(null);

			abortRef.current = streamTts({
				text,
				engine,
				voicePrompt,
				language,
				seed,
				onChunk: (audio, sampleRate, isFinal) => {
					playChunk(audio, sampleRate, isFinal);
					setIsLoading(false);
				},
				onComplete: (result) => {
					setIsLoading(false);
					setAudioPath(result?.audioPath ?? null);
					setGenerationId(result?.generationId ?? null);
					onComplete?.(result);
				},
				onError: (err) => {
					setIsLoading(false);
					setError(err);
					onError?.(err);
					showStudioErrorToast(err);
				},
			});
		},
		[engine, voicePrompt, language, seed, onComplete, onError, playChunk, stop],
	);

	return {
		isPlaying: playerState.isPlaying,
		isLoading,
		error,
		audioPath,
		generationId,
		start,
		stop,
	};
}
