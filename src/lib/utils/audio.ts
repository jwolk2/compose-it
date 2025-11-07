import type { ToneAudioBuffer } from 'tone';

export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
	const numChannels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const samples = buffer.length;
	const blockAlign = numChannels * 2;
	const byteRate = sampleRate * blockAlign;
	const dataSize = samples * blockAlign;
	const bufferLength = 44 + dataSize;
	const arrayBuffer = new ArrayBuffer(bufferLength);
	const view = new DataView(arrayBuffer);
	let offset = 0;

	const writeString = (value: string) => {
		for (let i = 0; i < value.length; i += 1) {
			view.setUint8(offset + i, value.charCodeAt(i));
		}
		offset += value.length;
	};

	writeString('RIFF');
	view.setUint32(offset, 36 + dataSize, true);
	offset += 4;
	writeString('WAVE');
	writeString('fmt ');
	view.setUint32(offset, 16, true);
	offset += 4;
	view.setUint16(offset, 1, true);
	offset += 2;
	view.setUint16(offset, numChannels, true);
	offset += 2;
	view.setUint32(offset, sampleRate, true);
	offset += 4;
	view.setUint32(offset, byteRate, true);
	offset += 4;
	view.setUint16(offset, blockAlign, true);
	offset += 2;
	view.setUint16(offset, 16, true);
	offset += 2;
	writeString('data');
	view.setUint32(offset, dataSize, true);
	offset += 4;

	const interleaved = new Float32Array(samples * numChannels);
	for (let channel = 0; channel < numChannels; channel += 1) {
		const channelData = buffer.getChannelData(channel);
		for (let i = 0; i < samples; i += 1) {
			interleaved[i * numChannels + channel] = channelData[i];
		}
	}

	const clamp = (value: number) => Math.max(-1, Math.min(1, value));
	for (let i = 0; i < interleaved.length; i += 1) {
		const sample = clamp(interleaved[i]);
		view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
		offset += 2;
	}

	return new Blob([arrayBuffer], { type: 'audio/wav' });
};

export const toneBufferToAudioBuffer = (toneBuffer: ToneAudioBuffer): AudioBuffer => {
	const { numberOfChannels, length, sampleRate } = toneBuffer;
	const context = new OfflineAudioContext(numberOfChannels, length, sampleRate);
	const audioBuffer = context.createBuffer(numberOfChannels, length, sampleRate);
	for (let channel = 0; channel < numberOfChannels; channel += 1) {
		const data = toneBuffer.getChannelData(channel);
		audioBuffer.copyToChannel(new Float32Array(data), channel);
	}
	return audioBuffer;
};
