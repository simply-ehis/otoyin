/**
 * timeline.ts — pure math/state helpers for the dub timeline segment editor.
 * Ported from VoiceStudio's @shared/utils/timeline.js.
 *
 * All times are seconds (float), all pixels are CSS px. DOM-free and unit-testable.
 */

// Minimum slot a segment may be resized down to (seconds).
export const MIN_SEG_DUR = 0.3;
// Alt-drag may push past the hard non-overlap clamp by at most this much (seconds).
export const MAX_OVERLAP = 0.2;
// Snap radius in *pixels* — converted to seconds via pxPerSec at call sites.
export const SNAP_PX = 8;
// Below this zoom the integer-second grid joins the snap candidates.
const GRID_SNAP_MAX_PX_PER_SEC = 40;

/**
 * snapTime — pure snap: nearest candidate within thresholdS wins.
 * Ties resolve to the earliest candidate so behaviour is deterministic.
 * Returns { time, candidate } — candidate === null means "no snap".
 */
export function snapTime(
	t: number,
	candidates: number[],
	thresholdS: number,
): { time: number; candidate: number | null } {
	let best: number | null = null;
	let bestDist = Infinity;
	for (const c of candidates) {
		if (!Number.isFinite(c)) continue;
		const d = Math.abs(c - t);
		if (
			d <= thresholdS &&
			(d < bestDist || (d === bestDist && best !== null && c < best))
		) {
			best = c;
			bestDist = d;
		}
	}
	return best === null ? { time: t, candidate: null } : { time: best, candidate: best };
}

/**
 * snapCandidates — the candidate set for a drag, per the editor spec:
 * onsets + adjacent segment edges + playhead + (at low zoom) the
 * integer-second grid around t.
 */
export function snapCandidates(params: {
	onsets?: number[];
	prevEnd?: number;
	nextStart?: number;
	playhead?: number;
	pxPerSec?: number;
	t?: number;
}): number[] {
	const { onsets = [], prevEnd, nextStart, playhead, pxPerSec, t } = params;
	const out: number[] = [];
	for (const o of onsets) out.push(o);
	if (prevEnd !== undefined) out.push(prevEnd);
	if (nextStart !== undefined) out.push(nextStart);
	if (playhead !== undefined) out.push(playhead);
	if (
		pxPerSec !== undefined &&
		pxPerSec > 0 &&
		pxPerSec < GRID_SNAP_MAX_PX_PER_SEC &&
		t !== undefined
	) {
		out.push(Math.floor(t), Math.ceil(t));
	}
	return out;
}

/**
 * clampSegmentEdit — enforce the overlap/ordering rules on a proposed edit.
 *
 * mode: 'start' | 'end' | 'move'
 * Default = hard non-overlap: edges clamp exactly at the neighbour's
 * boundary (segments may touch, never cross). With allowOverlap (Alt held)
 * the edge may push up to MAX_OVERLAP past the neighbour. Reordering past a
 * neighbour is never possible. Resizes preserve MIN_SEG_DUR against the
 * opposite edge; moves preserve duration.
 */
export function clampSegmentEdit(
	segments: DubSegmentLike[],
	index: number,
	mode: "start" | "end" | "move",
	proposed: { start: number; end: number },
	opts: { allowOverlap?: boolean; duration?: number } = {},
): { start: number; end: number } {
	const { allowOverlap = false, duration = Infinity } = opts;
	const seg = segments[index];
	const prev = index > 0 ? segments[index - 1] : null;
	const next = index < segments.length - 1 ? segments[index + 1] : null;
	const give = allowOverlap ? MAX_OVERLAP : 0;
	const minStart = Math.max(0, prev ? prev.end - give : 0);
	const maxEnd = Math.min(duration, next ? next.start + give : duration);

	let start: number;
	let end: number;
	if (mode === "move") {
		const dur = seg.end - seg.start;
		start = Math.max(minStart, Math.min(proposed.start, maxEnd - dur));
		// Degenerate squeeze (neighbours closer than the segment is long):
		// pin to the lower bound rather than producing start > end games.
		if (start < minStart) start = minStart;
		end = start + dur;
	} else if (mode === "start") {
		start = Math.min(Math.max(proposed.start, minStart), seg.end - MIN_SEG_DUR);
		end = seg.end;
	} else {
		end = Math.max(Math.min(proposed.end, maxEnd), seg.start + MIN_SEG_DUR);
		start = seg.start;
	}
	return { start: +start.toFixed(3), end: +end.toFixed(3) };
}

/**
 * commitMoveResize — produce the updated segment object for a finished
 * move/resize gesture.
 *
 * - A pure MOVE (duration preserved) touches ONLY start/end.
 * - A RESIZE recomputes speed exactly: speed = original_duration / newDuration,
 *   persisting the very first original_duration so successive drags compound.
 * - If a resize lands back at speed === 1.0 the `speed` key is deleted.
 */
export function commitMoveResize(
	seg: DubSegmentLike,
	next: { start: number; end: number },
): DubSegmentLike {
	const newStart = +next.start.toFixed(3);
	const newEnd = +next.end.toFixed(3);
	const oldDur = seg.end - seg.start;
	const newDur = newEnd - newStart;
	// Classify the gesture before rounding: sub-millisecond imported edges can round differently.
	const isMove = Math.abs(newEnd - newStart - oldDur) < 0.0005;
	if (isMove) {
		return { ...seg, start: newStart, end: newEnd };
	}
	const origDur = seg.original_duration || oldDur;
	const newSpeed = newDur > 0 ? +(origDur / newDur).toFixed(2) : 1.0;
	const result: DubSegmentLike = {
		...seg,
		start: newStart,
		end: newEnd,
		original_duration: origDur,
	};
	if (newSpeed === 1) {
		delete result.speed;
	} else {
		result.speed = newSpeed;
	}
	return result;
}

/**
 * detectOverlaps — Set of String(id) for every segment that overlaps a
 * neighbour (start-sorted sweep; tiny epsilon so touching edges don't flag).
 */
export function detectOverlaps(
	segments: DubSegmentLike[],
	epsilon = 1e-6,
): Set<string> {
	const flagged = new Set<string>();
	if (segments.length < 2) return flagged;
	const sorted = [...segments].sort((x, y) => x.start - y.start || x.end - y.end);
	const active: DubSegmentLike[] = [];
	for (const cur of sorted) {
		const filtered: DubSegmentLike[] = [];
		for (const previous of active) {
			if (previous.end > cur.start + epsilon) filtered.push(previous);
		}
		for (const previous of filtered) {
			flagged.add(String(previous.id));
			flagged.add(String(cur.id));
		}
		filtered.push(cur);
		active.length = 0;
		active.push(...filtered);
	}
	return flagged;
}

/**
 * nearestOnset — closest onset to t, or null when none exist.
 */
export function nearestOnset(t: number, onsets: number[]): number | null {
	let best: number | null = null;
	let bestDist = Infinity;
	for (const o of onsets) {
		const d = Math.abs(o - t);
		if (d < bestDist) {
			best = o;
			bestDist = d;
		}
	}
	return best;
}

/**
 * visibleSegmentRange — windowing for the virtualized track.
 * Binary search over segments sorted by `start` for the index window
 * covering [viewStart, viewEnd] (+ buffer). Returns [lo, hi).
 */
export function visibleSegmentRange(
	segments: DubSegmentLike[],
	viewStart: number,
	viewEnd: number,
	bufferS = 2,
): [number, number] {
	const n = segments.length;
	if (!n) return [0, 0];
	const t0 = viewStart - bufferS;
	const t1 = viewEnd + bufferS;

	// lo: first segment whose end could reach t0
	let a = 0,
		b = n;
	while (a < b) {
		const mid = (a + b) >> 1;
		if (segments[mid].start < t0) a = mid + 1;
		else b = mid;
	}
	let lo = a;
	while (lo > 0 && segments[lo - 1].end > t0) lo -= 1;

	// hi: first segment that starts after t1
	a = lo;
	b = n;
	while (a < b) {
		const mid = (a + b) >> 1;
		if (segments[mid].start <= t1) a = mid + 1;
		else b = mid;
	}
	return [lo, a];
}

/**
 * Format seconds as m:ss.x or mm:ss.x
 */
export function formatTime(seconds: number, decimals = 1): string {
	const total = Math.max(0, seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toFixed(decimals).padStart(decimals + 3, "0")}`;
}

/**
 * Shape of a timeline segment — matches DubSegment from the API client.
 */
export interface DubSegmentLike {
	id: number | string;
	start: number;
	end: number;
	speaker?: string;
	original_text?: string;
	translated_text?: string;
	has_audio?: boolean;
	original_duration?: number;
	speed?: number;
}
