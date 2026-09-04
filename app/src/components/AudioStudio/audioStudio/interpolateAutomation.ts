import type { AutomationPoint } from "../AudioStudioStore";
export function interpolateAutomation(
	points: AutomationPoint[],
	time: number,
): number | null {
	if (points.length === 0) {
		return null;
	}
	if (time <= points[0].time) {
		return points[0].value;
	}
	const last = points[points.length - 1];
	if (time >= last.time) {
		return last.value;
	}
	for (let i = 1; i < points.length; i++) {
		if (time <= points[i].time) {
			const a = points[i - 1];
			const b = points[i];
			const span = b.time - a.time || 1;
			return a.value + (b.value - a.value) * ((time - a.time) / span);
		}
	}
	return last.value;
}
