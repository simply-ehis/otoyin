import type { AutomationPoint } from "@/stores/storyStore";

/** Story timecode formatting (m:ss.t). */
export function formatTime(ms: number): string {
	const total = Math.max(0, ms) / 1000;
	const m = Math.floor(total / 60);
	const s = total - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Linear envelope evaluation (ported from the archived editor lane). */
export function interpolateValue(
	points: AutomationPoint[],
	timeMs: number,
	defaultValue: number,
): number {
	if (points.length === 0) {
		return defaultValue;
	}
	const first = points[0];
	const last = points[points.length - 1];
	if (!first || !last) {
		return defaultValue;
	}
	if (timeMs <= first.timeMs) {
		return first.value;
	}
	if (timeMs >= last.timeMs) {
		return last.value;
	}

	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (a && b && timeMs >= a.timeMs && timeMs <= b.timeMs) {
			const span = b.timeMs - a.timeMs;
			const t = span === 0 ? 0 : (timeMs - a.timeMs) / span;
			return a.value + t * (b.value - a.value);
		}
	}
	return defaultValue;
}
