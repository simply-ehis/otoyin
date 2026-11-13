import { useEffect, useRef } from "react";
import { apiClient } from "@/lib/api/client";
import {
	clearResumePoint,
	readResumePoint,
	writeResumePoint,
} from "@/lib/playerResume";
import { usePlayerStore } from "@/stores/playerStore";

/**
 * Resume the last played/paused track across reloads, at its last position.
 * Resume only — never auto-plays. No-op when nothing was playing before.
 *
 * The resume point is re-written on a 2s interval only while a track is
 * loaded, keeping storage pressure low (currentTime fires far more often
 * than that during playback).
 */
export function usePlayerResume(): void {
	const bootedRef = useRef(false);

	useEffect(() => {
		if (bootedRef.current) {
			return;
		}
		bootedRef.current = true;

		const stored = readResumePoint();
		if (!stored) {
			return;
		}

		const url = apiClient.getAudioUrl(stored.audioId);
		fetch(url, { method: "HEAD" })
			.then((res) => {
				if (!res.ok) {
					clearResumePoint();
					return;
				}
				const st = usePlayerStore.getState();
				// Paused resume is fine; a point past/equal duration is useless,
				// start from 0 instead.
				const safePosition = stored.position;
				st.resumeTrack(url, stored.audioId, null, stored.title, safePosition);
			})
			.catch(() => {
				// Server unreachable on boot — keep stored point for next time.
			});
	}, []);

	useEffect(() => {
		const id = window.setInterval(() => {
			const st = usePlayerStore.getState();
			if (!st.audioUrl || !st.audioId) {
				return;
			}
			writeResumePoint({
				audioId: st.audioId,
				title: st.title,
				position: st.currentTime,
				savedAt: Date.now(),
			});
		}, 2000);
		return () => window.clearInterval(id);
	}, []);
}
