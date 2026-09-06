/**
 * Instrument zone selection logic, ported from Resonant (© 2026 Calesthio, AGPL-3.0-only).
 * chooseZone picks the best sample zone for a given pitch + velocity.
 */
import type { SampleZone } from "./types";

export function chooseZone(
	zones: SampleZone[],
	pitch: number,
	velocity: number,
): SampleZone | undefined {
	const midiVelocity = Math.round(Math.max(0, Math.min(1, velocity)) * 127);
	const matching = zones.filter((zone) => {
		const loKey = zone.loKey ?? zone.keyRangeLow ?? 0;
		const hiKey = zone.hiKey ?? zone.keyRangeHigh ?? 127;
		const loVel = zone.loVel ?? zone.velRangeLow ?? 0;
		const hiVel = zone.hiVel ?? zone.velRangeHigh ?? 127;
		return (
			pitch >= loKey &&
			pitch <= hiKey &&
			midiVelocity >= loVel &&
			midiVelocity <= hiVel
		);
	});
	return (
		matching[0] ??
		zones.reduce<SampleZone | undefined>((best, zone) => {
			const root =
				zone.rootKey ?? Math.round((zone.originalPitch ?? 6000) / 100);
			const bestRoot = best
				? (best.rootKey ?? Math.round((best.originalPitch ?? 6000) / 100))
				: -999;
			return !best || Math.abs(root - pitch) < Math.abs(bestRoot - pitch)
				? zone
				: best;
		}, undefined)
	);
}
