import { useCallback, useRef, useState } from "react";
import { useStreamingAudioPlayer } from "@/lib/hooks/useStreamingAudioPlayer";
import { streamTts } from "@/lib/streamingTts";

export interface StreamingTtsPreviewState {
	isPlaying: boolean;
	isLoading: boolean;
	progress: number;
	error: string | null;
	audioPath: string | null;
	generationId: string | null;
}

export interface StreamingTtsPreviewControls {
	play: (
		text: string,
		voicePrompt?: Record<string, unknown>,
		language?: string,
	) => void;
	stop: () => void;
	state: StreamingTtsPreviewState;
}

/**
 * Reusable hook for streaming TTS preview with audio playback.
 *
 * Usage:
 *   const preview = useStreamingTtsPreview();
 *   preview.play("Hello world", "af_heart");
 *   preview.stop();
 */
export function useStreamingTtsPreview(): StreamingTtsPreviewControls {
	const player = useStreamingAudioPlayer();
	const [state, setState] = useState<StreamingTtsPreviewState>({
		isPlaying: false,
		isLoading: false,
		progress: 0,
		error: null,
		audioPath: null,
		generationId: null,
	});
	const abortRef = useRef<(() => void) | null>(null);

	const play = useCallback(
		(text: string, voicePrompt?: Record<string, unknown>, language = "en") => {
			if (!text.trim()) {
				return;
			}
			setState({
				isPlaying: true,
				isLoading: true,
				progress: 0,
				error: null,
				audioPath: null,
				generationId: null,
			});
			player.reset();

			const abort = streamTts({
				text: text.trim(),
				voicePrompt: voicePrompt ?? {},
				language,
				onChunk: (audio, sampleRate, isFinal) => {
					player.playChunk(audio, sampleRate, isFinal);
				},
				onComplete: (result) => {
					setState((prev) => ({
						...prev,
						isPlaying: false,
						isLoading: false,
						progress: 100,
						audioPath: result?.audioPath ?? null,
						generationId: result?.generationId ?? null,
					}));
				},
				onError: (err) => {
					setState((prev) => ({
						...prev,
						isPlaying: false,
						isLoading: false,
						error: err,
					}));
				},
			});
			abortRef.current = abort;
		},
		[player],
	);

	const stop = useCallback(() => {
		abortRef.current?.();
		player.stop();
		setState({
			isPlaying: false,
			isLoading: false,
			progress: 0,
			error: null,
			audioPath: null,
			generationId: null,
		});
	}, [player]);

	return { play, stop, state };
}
