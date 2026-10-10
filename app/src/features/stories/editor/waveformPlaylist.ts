/**
 * Helpers for the waveform-playlist (@waveform-playlist/browser v15) adapter.
 *
 * The playlist lives in SAMPLE space at a fixed timeline sample rate, while
 * otoyin's editor state (useStoryStore, useTimelineState) lives in
 * MILLISECONDS. These converters are the single seam between the two
 * coordinate systems.
 *
 * Zoom contract (verified in @waveform-playlist/engine dist): the
 * PlaylistEngine constructor THROWS unless the initial samplesPerPixel is an
 * exact member of zoomLevels, and setZoomLevel() snaps to the nearest rung —
 * there is no arbitrary zoom. So otoyin's continuous pixels-per-second value
 * is always snapped through `snapSpp` onto a dense ladder that includes
 * fall-back rungs for degenerate containers.
 *
 * Volume note: otoyin's clip `volume` (0..1 slider) and `gain_db` are kept as
 * DATA ONLY on the playlist clips (clip.gain). The playlist engine runs
 * silent — otoyin's useStoryPlayback owns all audio output. The playlist is
 * visualization + geometry; it must never produce sound.
 */
import type { AudioClip, ClipTrack } from "@waveform-playlist/core";
import { apiClient } from "@/lib/api/client";
import type { StoryItemDetail } from "@/lib/api/types";
import { TRACK_HEIGHT } from "./timeline";

/** Timeline sample rate. Matches the engine's default (48 kHz). */
export const TIMELINE_SAMPLE_RATE = 48000;

/** The playlist renders its own in-scroll timescale at a fixed 30px. */
export const PLAYLIST_TIMESCALE_HEIGHT = 30;

/**
 * Zoom ladder. The engine requires the initial samplesPerPixel to be an
 * exact member of this list, and every zoom snaps to the nearest rung — so
 * it must be dense enough to approximate any fit-zoom. ×1.5 geometric steps
 * from 256 spp (≈187 px/s) out to 131072 spp (≈0.37 px/s), covering a
 * whole-project fit for long stories and the 10s-minimum zoom-in bound.
 */
export const ZOOM_LADDER_SPP = [
	256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384,
	24576, 32768, 49152, 65536, 98304, 131072,
];

/**
 * Snap otoyin's continuous pixels-per-second to the nearest ladder rung in
 * samples-per-pixel space. The engine requires exact membership, and every
 * call site (initial mount, scrollbar drag, toolbar zoom) goes through here.
 */
export function ppsToSamplesPerPixel(pps: number): number {
	const exact = TIMELINE_SAMPLE_RATE / Math.max(1, pps);
	return ZOOM_LADDER_SPP.reduce((best, rung) =>
		Math.abs(rung - exact) < Math.abs(best - exact) ? rung : best,
	);
}

/** Convert playlist samples-per-pixel back to otoyin's pixels-per-second. */
export function samplesPerPixelToPps(spp: number): number {
	return TIMELINE_SAMPLE_RATE / spp;
}

/** Imperative zoom controls StoryTrackEditor's toolbar drives. */
export interface PlaylistZoomHandle {
	zoomIn: () => void;
	zoomOut: () => void;
}

export function msToSamples(ms: number): number {
	return Math.round((ms / 1000) * TIMELINE_SAMPLE_RATE);
}

/** Convert a CSS custom-property token to the `hsl(h s% l%)` string the playlist theme expects. */
export function hslFromToken(token: string): string {
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(token)
		.trim();
	return value ? `hsl(${value})` : "";
}

/**
 * One otoyin StoryItemDetail → one playlist AudioClip.
 *
 * start_time_ms → startSample; trim window → offset/duration; volume ×
 * gain_db → clip.gain (data only — engine is silent); fade_ms → Fade
 * duration in seconds. The source buffer is decoded at the timeline rate by
 * the adapter's shared AudioContext, so clip.sampleRate always equals the
 * timeline rate and no per-clip rate conversion ever misplaces geometry.
 */
export function itemToAudioClip(
	item: StoryItemDetail,
	buffer: AudioBuffer,
): AudioClip {
	const trimStart = item.trim_start_ms || 0;
	const trimEnd = item.trim_end_ms || 0;
	const speed = item.speed || 1;
	const sourceSpanMs = Math.max(0, item.duration * 1000 - trimStart - trimEnd);
	return {
		id: item.id,
		audioBuffer: buffer,
		startSample: msToSamples(item.start_time_ms),
		// Timeline-visible length = source span / speed (speed>1 → shorter clip).
		durationSamples: Math.max(1, Math.round(msToSamples(sourceSpanMs) / speed)),
		offsetSamples: msToSamples(trimStart),
		sampleRate: buffer.sampleRate,
		sourceDurationSamples: buffer.length,
		gain: item.volume * 10 ** ((item.gain_db || 0) / 20),
		name: item.engine === "import" ? item.text : item.profile_name,
		fadeIn: { duration: (item.fade_in_ms || 0) / 1000 },
		fadeOut: { duration: (item.fade_out_ms || 0) / 1000 },
	};
}

/** Stable ids for otoyin track numbers (they may be negative or sparse). */
export function trackId(trackNumber: number): string {
	return `otoyin-track-${trackNumber}`;
}

/**
 * Group items into one ClipTrack per timeline track, ordered top→bottom by
 * `trackNumbers` (StoryTrackEditor's `tracks` array, already sorted).
 * Track volume stays 0 (engine silent); per-clip values ride the clips.
 * Items whose buffer failed to decode are skipped — decode failures are
 * logged by the adapter.
 */
export function buildClipTracks(
	items: StoryItemDetail[],
	bufferMap: Map<string, AudioBuffer>,
	trackNumbers: number[],
): ClipTrack[] {
	return trackNumbers.map((trackNumber) => ({
		id: trackId(trackNumber),
		name: String(trackNumber),
		clips: items
			.filter((item) => item.track === trackNumber)
			.filter((item) => bufferMap.has(item.generation_id))
			.map((item) =>
				itemToAudioClip(item, bufferMap.get(item.generation_id) as AudioBuffer),
			),
		muted: false,
		soloed: false,
		volume: 0, // engine silent — otoyin owns audio
		pan: 0,
		height: TRACK_HEIGHT,
	}));
}

/**
 * Decode one clip's audio via the adapter's shared AudioContext (created at
 * the timeline rate, so every returned buffer shares one sample rate).
 * Resolves null when the source is missing or unreadable (e.g. deleted
 * generation) — the adapter logs it and renders the clip without a waveform.
 */
export async function decodeClipAudio(
	item: StoryItemDetail,
	ctx: AudioContext,
): Promise<AudioBuffer | null> {
	try {
		const url = item.version_id
			? apiClient.getVersionAudioUrl(item.version_id)
			: apiClient.getAudioUrl(item.generation_id);
		const res = await fetch(url);
		if (!res.ok) {
			return null;
		}
		const arr = await res.arrayBuffer();
		return await ctx.decodeAudioData(arr);
	} catch {
		return null;
	}
}
