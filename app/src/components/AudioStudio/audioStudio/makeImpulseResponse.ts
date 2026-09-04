export function makeImpulseResponse(
	ctx: BaseAudioContext,
	seconds: number,
): AudioBuffer {
	const sr = ctx.sampleRate;
	const len = Math.max(1, Math.floor(sr * Math.max(0.1, seconds)));
	const buf = ctx.createBuffer(2, len, sr);
	for (let c = 0; c < 2; c++) {
		const data = buf.getChannelData(c);
		for (let i = 0; i < len; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
		}
	}
	return buf;
}
