const irCache = new Map<string, AudioBuffer>();

export function makeImpulseResponse(
	ctx: BaseAudioContext,
	seconds: number,
): AudioBuffer {
	const sr = ctx.sampleRate;
	const key = `${sr}:${seconds}`;
	const cached = irCache.get(key);
	if (cached) {
		return cached;
	}
	const len = Math.max(1, Math.floor(sr * Math.max(0.1, seconds)));
	const buf = ctx.createBuffer(2, len, sr);
	for (let c = 0; c < 2; c++) {
		const data = buf.getChannelData(c);
		for (let i = 0; i < len; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
		}
	}
	// Bound the cache — IRs are large (stereo float32); keep the last 4.
	if (irCache.size >= 4) {
		const oldest = irCache.keys().next().value;
		if (oldest !== undefined) {
			irCache.delete(oldest);
		}
	}
	irCache.set(key, buf);
	return buf;
}
