import { writeString } from "./writeString";
export function audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
	const numChannels = audioBuffer.numberOfChannels;
	const sampleRate = audioBuffer.sampleRate;
	const format = 1; // PCM
	const bitDepth = 16;

	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;
	const dataSize = audioBuffer.length * blockAlign;
	const headerSize = 44;
	const totalSize = headerSize + dataSize;

	const arrayBuffer = new ArrayBuffer(totalSize);
	const view = new DataView(arrayBuffer);

	writeString(view, 0, "RIFF");
	view.setUint32(4, totalSize - 8, true);
	writeString(view, 8, "WAVE");
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, format, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeString(view, 36, "data");
	view.setUint32(40, dataSize, true);

	const channelData: Float32Array[] = [];
	for (let c = 0; c < numChannels; c++) {
		channelData.push(audioBuffer.getChannelData(c));
	}

	let offset = 44;
	for (let i = 0; i < audioBuffer.length; i++) {
		for (let c = 0; c < numChannels; c++) {
			const sample = Math.max(-1, Math.min(1, channelData[c][i]));
			const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
			view.setInt16(offset, intSample, true);
			offset += 2;
		}
	}

	return arrayBuffer;
}
