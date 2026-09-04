export function getPeakWaveform(
	audioBuffer: AudioBuffer,
	numSamples: number,
): Float32Array {
	const channel = audioBuffer.getChannelData(0);
	const peaks = new Float32Array(numSamples);
	const total = channel.length;
	for (let i = 0; i < numSamples; i++) {
		let max = 0;
		const start = Math.floor((i * total) / numSamples);
		const end = Math.floor(((i + 1) * total) / numSamples);
		for (let j = start; j < end; j++) {
			const abs = Math.abs(channel[j] || 0);
			if (abs > max) {
				max = abs;
			}
		}
		peaks[i] = max;
	}
	return peaks;
}
