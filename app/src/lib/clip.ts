/**
 * Cross-tab clipboard: a serializable reference to any audio output.
 *
 * A clip is a *link* (by backend entity id), not a copy of the audio bytes.
 * Copying writes it to the server-backed single-slot clipboard
 * (PUT /clipboard); any other tab/window reads it via GET /clipboard.
 * Because every window talks to the same backend, no extra cross-window
 * event plumbing is needed — the server is the source of truth.
 */

import { useServerStore } from "@/stores/serverStore";

export type ClipKind =
	| "sample"
	| "capture"
	| "generation"
	| "story_item"
	| "studio_track"
	| "adr_take"
	| "comp"
	| "mixer_state"
	| "dsp";

export interface Clip {
	kind: ClipKind;
	/** Stable backend entity id the clip refers to. */
	id: string;
	/** URL for immediate preview playback. */
	audioUrl: string;
	name: string;
	durationMs: number;
	/** Local trim applied at paste time, not stored on the clip itself. */
	trimStartMs?: number;
	trimEndMs?: number;
}

interface ClipboardPayload {
	kind: ClipKind;
	entity_id: string;
	name: string;
	duration_ms: number | null;
	audio_url: string | null;
	created_at: string;
}

function toClip(p: ClipboardPayload): Clip {
	return {
		kind: p.kind as ClipKind,
		id: p.entity_id,
		audioUrl: p.audio_url ?? "",
		name: p.name,
		durationMs: p.duration_ms ?? 0,
	};
}

export async function copyClip(clip: Clip): Promise<void> {
	try {
		const res = await fetch(`${serverUrl()}/clipboard`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				kind: clip.kind,
				entity_id: clip.id,
				name: clip.name,
				duration_ms: clip.durationMs || null,
				audio_url: clip.audioUrl || null,
			}),
		});
		if (!res.ok) {
			throw new Error(`clipboard write failed: ${res.status}`);
		}
	} catch (err) {
		console.error("[clip] copyClip failed:", err);
		throw err;
	}
}

export async function getClip(): Promise<Clip | null> {
	try {
		const res = await fetch(`${serverUrl()}/clipboard`);
		if (res.status === 404) {
			return null;
		}
		if (!res.ok) {
			throw new Error(`clipboard read failed: ${res.status}`);
		}
		return toClip((await res.json()) as ClipboardPayload);
	} catch (err) {
		if (err instanceof Error && err.message.includes("404")) {
			return null;
		}
		console.error("[clip] getClip failed:", err);
		throw err;
	}
}

export async function clearClip(): Promise<void> {
	try {
		const res = await fetch(`${serverUrl()}/clipboard`, { method: "DELETE" });
		if (!res.ok) {
			throw new Error(`clipboard clear failed: ${res.status}`);
		}
	} catch (err) {
		console.error("[clip] clearClip failed:", err);
		throw err;
	}
}

/**
 * Best-effort audio duration in milliseconds for an arbitrary URL.
 * Used when a source (e.g. a voice profile sample) doesn't carry a
 * duration in its API payload — we measure it from the audio metadata so
 * the clip can support trim UI on paste. Resolves to 0 if it can't load.
 */
export function resolveAudioDurationMs(url: string): Promise<number> {
	return new Promise((resolve) => {
		const audio = new Audio(url);
		audio.addEventListener("loadedmetadata", () =>
			resolve(Math.round(audio.duration * 1000)),
		);
		audio.addEventListener("error", () => resolve(0));
	});
}

function serverUrl(): string {
	return useServerStore.getState().serverUrl;
}
