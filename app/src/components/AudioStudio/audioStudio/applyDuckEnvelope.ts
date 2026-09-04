/**
 * Apply a sidechain-style auto-duck gain envelope to a rendered mix buffer.
 * A peak-following loudness tracker (fast decay) estimates the mix level;
 * while it sits above `thresholdDb`, gain is smoothed down toward the
 * `gainDb` reduction (fast attack), and back to unity when it drops below
 * (slow release). Matches the live-playback duck node math (10^(gainDb/20)).
 */
export function applyDuckEnvelope(
	buffer: AudioBuffer,
	thresholdDb: number,
	gainDb: number,
): void {
	if (!buffer || buffer.length === 0 || gainDb >= 0) {
		return;
	}
	const sr = buffer.sampleRate;
	const win = Math.max(1, Math.floor(sr * 0.01));
	const gainReduction = 10 ** (gainDb / 20);
	const attack = 0.5; // per-window smoothing toward reduction (fast)
	const release = 0.02; // per-window smoothing back to unity (slow)
	const peakDecay = 0.98; // per-sample peak-follower decay (~0.45s at 44.1k)
	let currentGain = 1;
	let peak = 0;
	for (let i = 0; i < buffer.length; i++) {
		const ch0 = buffer.getChannelData(0);
		peak = Math.max(Math.abs(ch0[i]), peak * peakDecay);
		if (i % win === 0) {
			const db = 20 * Math.log10(Math.max(peak, 0.0001));
			const target = db > thresholdDb ? gainReduction : 1;
			const coef = target < currentGain ? attack : release;
			currentGain += (target - currentGain) * coef;
		}
		for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
			const data = buffer.getChannelData(ch);
			data[i] *= currentGain;
		}
	}
}
