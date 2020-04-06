'use strict';

import { createReadStream, createWriteStream, readdir } from 'fs';
import { join, dirname, extname, basename } from 'path';
//@ts-ignore
import { OpusEncoder } from 'node-opus';

const rate = 48000;
const frame_size = 1920;
const channels = 2;

let total = 0;
let complete = 0;

let getDecodedFrame = (frameString: any, encoder: any, filename: any) => {
	let buffer = Buffer.from(frameString, 'hex');
	try {
		buffer = encoder.decode(buffer, frame_size);
	} catch (err) {
		try {
			buffer = encoder.decode(buffer.slice(8), frame_size);
		} catch (err) {
			return null;
		}
	}
	return buffer;
};

export let convertOpusStringToRawPCM = (
	inputPath: string,
	filename: string,
	cb: (filename: string) => any
) => {
	total++;
	let encoder = new OpusEncoder(rate, channels);
	const inputStream = createReadStream(inputPath);
	const outputStream = createWriteStream(join(dirname(inputPath), `${filename}.raw_pcm`));
	let data = '';
	inputStream.on('data', chunk => {
		data += chunk.toString();
		const frames = data.split(',');
		if (frames.length) {
			data = frames.pop();
		}
		for (let frame of frames) {
			if (frame !== '') {
				const decodedBuffer = getDecodedFrame(frame, encoder, filename);
				if (decodedBuffer) {
					outputStream.write(decodedBuffer);
				}
			}
		}
	});
	inputStream.on('end', () => {
		outputStream.end((err: any) => {
			complete++;
		});
	});
	cb(outputStream.path as string)
};
