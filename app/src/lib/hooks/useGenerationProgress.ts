import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { useGenerationSettings } from "@/lib/hooks/useSettings";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";

interface GenerationStatusEvent {
	id: string;
	status:
		| "loading_model"
		| "generating"
		| "completed"
		| "failed"
		| "not_found"
		| "chunk_ready";
	duration?: number;
	error?: string;
	source?: string;
	// Streaming chunk fields
	chunk_index?: number;
	chunk_total?: number;
	chunk_url?: string;
}

// Agent-initiated generations are played by the floating pill, not the
// main-window AudioPlayer. Skip autoplay here to avoid double-playback.
const AGENT_SOURCES = new Set(["mcp", "rest"]);

const MAX_SSE_RETRIES = 3;
const SSE_RETRY_BASE_MS = 2000;
const CHUNK_FETCH_RETRIES = 3;
const CHUNK_FETCH_DELAY_MS = 500;

/**
 * Fetch a chunk URL with retry for slow disk writes.
 * Returns the original URL on success, or null if all retries failed.
 */
async function fetchChunkWithRetry(
	url: string,
	retries = CHUNK_FETCH_RETRIES,
): Promise<string | null> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await fetch(url, { method: "HEAD" });
			if (res.ok) {
				return url;
			}
			if (res.status !== 404) {
				return null; // Non-retryable error
			}
		} catch {
			// Network error — retry
		}
		if (attempt < retries) {
			await new Promise((r) =>
				setTimeout(r, CHUNK_FETCH_DELAY_MS * 2 ** attempt),
			);
		}
	}
	return null;
}

/**
 * Subscribes to SSE for all pending generations. When a generation completes,
 * invalidates the history query, removes it from pending, and auto-plays
 * if the player is idle.
 *
 * Supports streaming playback: when `chunk_ready` events arrive, chunks are
 * played immediately instead of waiting for full assembly. The first chunk
 * triggers auto-play; subsequent chunks are queued and played sequentially.
 * When the final `completed` event arrives, playback switches to the
 * fully-assembled audio for seamless crossfade.
 */
export function useGenerationProgress() {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const pendingIds = useGenerationStore((s) => s.pendingGenerationIds);
	const removePendingGeneration = useGenerationStore(
		(s) => s.removePendingGeneration,
	);
	const removePendingStoryAdd = useGenerationStore(
		(s) => s.removePendingStoryAdd,
	);
	const isPlaying = usePlayerStore((s) => s.isPlaying);
	const setAudioWithAutoPlay = usePlayerStore((s) => s.setAudioWithAutoPlay);
	const { settings: genSettings } = useGenerationSettings();
	const autoplayOnGenerate = genSettings?.autoplay_on_generate ?? true;

	// Keep refs to avoid stale closures in EventSource handlers
	const isPlayingRef = useRef(isPlaying);
	const autoplayRef = useRef(autoplayOnGenerate);
	isPlayingRef.current = isPlaying;
	autoplayRef.current = autoplayOnGenerate;

	// Track active EventSource instances and retry counts
	const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
	const retryCountsRef = useRef<Map<string, number>>(new Map());

	// Streaming playback state — per generation ID
	const chunkQueueRef = useRef<Map<string, string[]>>(new Map());
	const chunkPlayingRef = useRef<Map<string, boolean>>(new Map());
	const currentChunkIdxRef = useRef<Record<string, number>>({});
	const finalAudioReadyRef = useRef<Map<string, boolean>>(new Map());

	// Stable key for the dependency array
	const pendingIdsArray = useMemo(() => [...pendingIds].sort(), [pendingIds]);

	// Bumped when an SSE stream errors but has retries left, so the effect
	// below re-runs and reopens the EventSource for the still-pending id.
	const [retryNonce, setRetryNonce] = useState(0);

	// Unmount-only cleanup
	useEffect(() => {
		const sources = eventSourcesRef.current;
		return () => {
			for (const source of sources.values()) {
				source.close();
			}
			sources.clear();
		};
	}, []);

	useEffect(() => {
		const currentSources = eventSourcesRef.current;
		const retryCounts = retryCountsRef.current;

		// Close SSE connections for IDs no longer pending
		for (const [id, source] of currentSources.entries()) {
			if (!pendingIds.has(id)) {
				source.close();
				currentSources.delete(id);
				retryCounts.delete(id);
				chunkQueueRef.current.delete(id);
				chunkPlayingRef.current.delete(id);
				delete currentChunkIdxRef.current[id];
				finalAudioReadyRef.current.delete(id);
			}
		}

		// Open SSE connections for new pending IDs
		for (const id of pendingIdsArray) {
			if (currentSources.has(id)) {
				continue;
			}

			const url = apiClient.getGenerationStatusUrl(id);
			let source: EventSource;
			try {
				source = new EventSource(url);
			} catch {
				removePendingGeneration(id);
				continue;
			}

			source.onmessage = (event) => {
				try {
					const data: GenerationStatusEvent = JSON.parse(event.data);

					// ── Streaming chunk ready ──────────────────────────────
					if (data.status === "chunk_ready" && data.chunk_url) {
						const chunkIdx = data.chunk_index ?? 0;
						const chunkFullUrl = apiClient.getChunkUrl(id, chunkIdx);

						// Store the chunk URL at the correct index
						const queue = chunkQueueRef.current.get(id) ?? [];
						while (queue.length <= chunkIdx) {
							queue.push("");
						}
						queue[chunkIdx] = chunkFullUrl;
						chunkQueueRef.current.set(id, queue);

						// Auto-play the first chunk immediately (with retry for slow writes)
						if (
							chunkIdx === 0 &&
							autoplayRef.current &&
							!isPlayingRef.current &&
							!chunkPlayingRef.current.get(id)
						) {
							chunkPlayingRef.current.set(id, true);
							currentChunkIdxRef.current[id] = 0;

							// Chain next chunk when this one finishes
							usePlayerStore.getState().setOnFinish(() => {
								const curIdx = currentChunkIdxRef.current[id] ?? 0;
								const nextIdx = curIdx + 1;
								const q = chunkQueueRef.current.get(id);
								if (q && nextIdx < q.length && q[nextIdx]) {
									currentChunkIdxRef.current[id] = nextIdx;
								// Retry fetch for next chunk (slow disk write)
								fetchChunkWithRetry(q[nextIdx]).then((validUrl) => {
									if (validUrl) {
										setAudioWithAutoPlay(validUrl, id, "", "");
									} else {
										chunkPlayingRef.current.delete(id);
										delete currentChunkIdxRef.current[id];
										usePlayerStore.getState().setOnFinish(null);
										toast({
											title: "Streaming interrupted",
											description:
												"A streamed audio chunk could not be read. The finished audio will still play when ready.",
											variant: "destructive",
										});
									}
								});
								} else {
									chunkPlayingRef.current.delete(id);
									delete currentChunkIdxRef.current[id];
									usePlayerStore.getState().setOnFinish(null);
								}
							});

						// Fetch with retry before playing (handles slow disk writes)
						fetchChunkWithRetry(chunkFullUrl).then((validUrl) => {
							if (validUrl) {
								setAudioWithAutoPlay(validUrl, id, "", "");
							} else {
								chunkPlayingRef.current.delete(id);
								delete currentChunkIdxRef.current[id];
								usePlayerStore.getState().setOnFinish(null);
								toast({
									title: "Streaming interrupted",
									description:
										"A streamed audio chunk could not be read. The finished audio will still play when ready.",
									variant: "destructive",
								});
							}
						});
						}

						// Auto-play next chunk when it arrives mid-playback
						if (
							chunkIdx > 0 &&
							chunkPlayingRef.current.get(id) &&
							!usePlayerStore.getState().isPlaying
						) {
							currentChunkIdxRef.current[id] = chunkIdx;
							fetchChunkWithRetry(chunkFullUrl).then((validUrl) => {
								if (validUrl) {
									setAudioWithAutoPlay(validUrl, id, "", "");
								}
							});
						}

						return;
					}

					// ── Generation completed ────────────────────────────────
					if (data.status === "completed") {
						source.close();
						currentSources.delete(id);
						retryCounts.delete(id);
						removePendingGeneration(id);

						// Clean up streaming state
						chunkQueueRef.current.delete(id);
						chunkPlayingRef.current.delete(id);
						delete currentChunkIdxRef.current[id];
						finalAudioReadyRef.current.delete(id);

						// Refetch history
						queryClient.refetchQueries({ queryKey: ["history"] });

						// Story addition
						const storyId = removePendingStoryAdd(id);
						if (storyId) {
							apiClient
								.addStoryItem(storyId, { generation_id: id })
								.then(() => {
									queryClient.invalidateQueries({ queryKey: ["stories"] });
									queryClient.invalidateQueries({
										queryKey: ["stories", storyId],
									});
									toast({
										title: "Added to story",
										description: data.duration
											? `Audio generated (${data.duration.toFixed(2)}s) and added to story`
											: "Audio generated and added to story",
									});
								})
								.catch(() => {
									toast({
										title: "Generation complete",
										description: "Audio generated but failed to add to story",
										variant: "destructive",
									});
								});
						}

						// Switch to fully-assembled audio for seamless playback
						const isAgentSpeak = data.source
							? AGENT_SOURCES.has(data.source)
							: false;
						if (autoplayRef.current && !isAgentSpeak) {
							const genAudioUrl = apiClient.getAudioUrl(id);
							// If we were streaming, seamlessly switch to the final version.
							// If not streaming, start fresh playback.
							if (chunkPlayingRef.current.get(id)) {
								// Seamless switch: the player already has audio loaded;
								// update the URL so the next play cycle uses the assembled version.
								setAudioWithAutoPlay(genAudioUrl, id, "", "");
							} else if (!isPlayingRef.current) {
								setAudioWithAutoPlay(genAudioUrl, id, "", "");
							}
						}
						return;
					}

					// ── Failed / not found ──────────────────────────────────
					if (data.status === "failed" || data.status === "not_found") {
						source.close();
						currentSources.delete(id);
						retryCounts.delete(id);
						removePendingGeneration(id);
						removePendingStoryAdd(id);
						chunkQueueRef.current.delete(id);
						chunkPlayingRef.current.delete(id);
						delete currentChunkIdxRef.current[id];
						finalAudioReadyRef.current.delete(id);

						queryClient.refetchQueries({ queryKey: ["history"] });

						toast({
							title:
								data.status === "not_found"
									? "Generation not found"
									: "Generation failed",
							description: data.error || "An error occurred during generation",
							variant: "destructive",
						});
					}
					// loading_model / generating → no action needed
				} catch {
					// Ignore parse errors from heartbeats etc
				}
			};

			source.onerror = () => {
				source.close();
				currentSources.delete(id);

			const retries = retryCounts.get(id) ?? 0;
			if (retries < MAX_SSE_RETRIES) {
				retryCounts.set(id, retries + 1);
				const delay = SSE_RETRY_BASE_MS * 2 ** retries;
				setTimeout(() => {
					if (pendingIds.has(id) && !currentSources.has(id)) {
						// Re-run the effect so a fresh EventSource is opened
						// for this still-pending generation.
						setRetryNonce((n) => n + 1);
						queryClient.refetchQueries({ queryKey: ["history"] });
					}
				}, delay);
			} else {
					retryCounts.delete(id);
					removePendingGeneration(id);
					removePendingStoryAdd(id);
					chunkQueueRef.current.delete(id);
					chunkPlayingRef.current.delete(id);
					delete currentChunkIdxRef.current[id];
					finalAudioReadyRef.current.delete(id);
					queryClient.refetchQueries({ queryKey: ["history"] });
					toast({
						title: "Connection lost",
						description:
							"Lost real-time status for a generation after multiple retries. The history list has been refreshed.",
						variant: "destructive",
					});
				}
			};

			currentSources.set(id, source);
		}
	}, [
		removePendingGeneration,
		removePendingStoryAdd,
		queryClient,
		toast,
		setAudioWithAutoPlay,
		pendingIdsArray,
		pendingIds.has,
		retryNonce,
	]);
}
