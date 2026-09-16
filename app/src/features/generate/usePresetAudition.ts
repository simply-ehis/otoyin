import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { usePlayerStore } from "@/stores/playerStore";
import { useToast } from "@/ui/use-toast";

/** Minimal voice identity needed for an audition (subset of PresetVoice). */
export interface AuditionVoice {
	id: string;
	name: string;
	gender?: string | null;
	language?: string | null;
}

/**
 * Audition built-in preset voices without creating profiles.
 *
 * The first audition of a voice synthesizes a short snippet server-side
 * (the model must be downloaded); the blob URL is cached in memory and the
 * backend caches the wav on disk, so repeats are instant. Playback goes
 * through the shared player under a `preview-voice:` id. Tapping the same
 * row while its preview plays pauses instead of re-fetching.
 */
export function usePresetAudition(engine: string) {
	const { toast } = useToast();
	const cacheRef = useRef<Map<string, string>>(new Map());
	const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);

	// Blob URLs die with the page — drop them on unmount.
	useEffect(() => {
		const cache = cacheRef.current;
		return () => {
			for (const url of cache.values()) {
				URL.revokeObjectURL(url);
			}
			cache.clear();
		};
	}, []);

	const previewAudioId = useCallback(
		(voiceId: string) => `preview-voice:${engine}:${voiceId}`,
		[engine],
	);

	const isPreviewPlaying = useCallback(
		(voiceId: string) => {
			const st = usePlayerStore.getState();
			return st.audioId === previewAudioId(voiceId) && st.isPlaying;
		},
		[previewAudioId],
	);

	const audition = useCallback(
		async (voice: AuditionVoice) => {
			const id = previewAudioId(voice.id);
			const st = usePlayerStore.getState();
			if (st.audioId === id) {
				st.setIsPlaying(!st.isPlaying);
				return;
			}
			const key = `${engine}:${voice.id}`;
			const hit = cacheRef.current.get(key);
			if (hit) {
				usePlayerStore
					.getState()
					.setAudioWithAutoPlay(hit, id, null, voice.name);
				return;
			}
			setLoadingVoiceId(voice.id);
			try {
				const blob = await apiClient.synthesizePresetVoicePreview(
					engine,
					voice.id,
				);
				const url = URL.createObjectURL(blob);
				cacheRef.current.set(key, url);
				usePlayerStore
					.getState()
					.setAudioWithAutoPlay(url, id, null, voice.name);
			} catch (e) {
				toast({
					title: "Preview failed",
					description:
						e instanceof Error ? e.message : "Could not synthesize a snippet.",
					variant: "destructive",
				});
			} finally {
				setLoadingVoiceId(null);
			}
		},
		[engine, previewAudioId, toast],
	);

	return { audition, loadingVoiceId, isPreviewPlaying };
}
