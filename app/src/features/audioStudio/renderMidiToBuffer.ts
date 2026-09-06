export async function renderMidiToBuffer(
	ctx: BaseAudioContext,
	midiNotes: number[],
	durationSec: number,
): Promise<AudioBuffer | null> {
	if (!midiNotes.length) {
		return null;
	}
	const sr = ctx.sampleRate;
	const n = Math.max(1, Math.floor(sr * durationSec));
	const buffer = ctx.createBuffer(2, n, sr);
	const L = buffer.getChannelData(0);
	const R = buffer.getChannelData(1);
	const harmonics = [1.0, 0.5, 0.25, 0.125, 0.0625];
	const attack = Math.floor(0.01 * sr);
	const decay = Math.floor(0.1 * sr);
	const release = Math.floor(0.3 * sr);
	// Release only starts after the decay region so it never overlaps attack/decay,
	// even for very short buffers. Sustain level is 0.6 (decay target).
	const releaseStart = Math.min(n, attack + decay + release);
	for (const note of midiNotes) {
		const freq = 440 * 2 ** ((note - 69) / 12);
		for (let i = 0; i < n; i++) {
			let s = 0;
			for (let h = 0; h < harmonics.length; h++) {
				s += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 1) * (i / sr));
			}
			let env = 0.6;
			if (i < attack) {
				env = i / attack;
			} else if (i < attack + decay) {
				env = 1 + (0.6 - 1) * ((i - attack) / decay);
			} else if (i >= releaseStart) {
				env = 0.6 * ((n - i) / (n - releaseStart || 1));
			}
			const v = s * env * 0.8;
			L[i] += v;
			R[i] += v;
		}
	}
	let peak = 0;
	for (let i = 0; i < n; i++) {
		peak = Math.max(peak, Math.abs(L[i]));
	}
	if (peak > 0) {
		const g = 0.9 / peak;
		for (let i = 0; i < n; i++) {
			L[i] *= g;
			R[i] *= g;
		}
	}
	return buffer;
}
