/**
 * Resume point for the main player. Separate localStorage key from the
 * zustand persist store because {@link setCurrentTime} fires 4–10×/s during
 * playback — serialising that through zustand's persist on every tick would
 * thrash storage. This file is written on a 2s interval instead.
 */

const RESUME_KEY = "otoyin:player-resume";

export interface PlayerResumePoint {
	audioId: string;
	title: string | null;
	/** Seek position in seconds when the app was closed / track stopped. */
	position: number;
	/** ms epoch when the snapshot was taken. Used only to reject ancient junk. */
	savedAt: number;
}

export function readResumePoint(): PlayerResumePoint | null {
	try {
		const raw = localStorage.getItem(RESUME_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<PlayerResumePoint>;
		if (
			typeof parsed.audioId !== "string" ||
			typeof parsed.position !== "number" ||
			!Number.isFinite(parsed.position) ||
			parsed.position < 0
		) {
			return null;
		}
		return {
			audioId: parsed.audioId,
			title: typeof parsed.title === "string" ? parsed.title : null,
			position: parsed.position,
			savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
		};
	} catch {
		return null;
	}
}

export function writeResumePoint(point: PlayerResumePoint): void {
	try {
		localStorage.setItem(RESUME_KEY, JSON.stringify(point));
	} catch {
		// Storage unavailable/quota — resume is best-effort, never fatal.
	}
}

export function clearResumePoint(): void {
	try {
		localStorage.removeItem(RESUME_KEY);
	} catch {
		// Nothing to do.
	}
}
