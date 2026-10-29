import type { PluginChainItem } from "./AudioStudioStore";

/** Parametric EQ band: computes the magnitude response for the visualizer. */
export function eqBandResponse(
	freq: number,
	center: number,
	gain: number,
	q: number,
	type: BiquadFilterType,
): number {
	if (gain === 0) {
		return 0;
	}
	const ratio = freq / center;
	const qSq = q * q;
	if (type === "lowshelf" || type === "highshelf") {
		const shelfQ = Math.max(q, Math.SQRT1_2);
		const a = 10 ** (gain / 40);
		const sqNorm = (freq / (center * shelfQ)) ** 2;
		const shift = Math.log10(1 + sqNorm * (a * a - 1));
		if (type === "lowshelf") {
			return freq < center * 2 ? gain * Math.min(shift, 1) : 0;
		}
		return freq > center / 2 ? gain * Math.min(shift, 1) : 0;
	}
	return gain / (1 + qSq * (ratio - 1 / ratio) ** 2);
}

/** Default EQ band definitions. */
export const EQ_BANDS = [
	{
		key: "low",
		label: "Low",
		type: "lowshelf" as BiquadFilterType,
		defaultFreq: 100,
		defaultQ: Math.SQRT1_2,
	},
	{
		key: "mid1",
		label: "Mid 1",
		type: "peaking" as BiquadFilterType,
		defaultFreq: 1000,
		defaultQ: 1.0,
	},
	{
		key: "mid2",
		label: "Mid 2",
		type: "peaking" as BiquadFilterType,
		defaultFreq: 3000,
		defaultQ: 1.0,
	},
	{
		key: "high",
		label: "High",
		type: "highshelf" as BiquadFilterType,
		defaultFreq: 8000,
		defaultQ: Math.SQRT1_2,
	},
] as const;

/**
 * Effect processing is now delegated to the backend (Spotify Pedalboard).
 * The /effects/process endpoint applies the effect chain or preset to an
 * audio file and returns the processed WAV.  Frontend real-time DSP nodes
 * have been removed in favour of backend processing during bounce/export.
 *
 * This function is kept as a no-op shim so existing call sites continue
 * to compile; it always returns null (no in-browser effect chain).
 */
export function buildEffectChain(
	_ctx: BaseAudioContext,
	_pluginChain: PluginChainItem[],
): { input: AudioNode; output: AudioNode; dispose: () => void } | null {
	return null;
}
