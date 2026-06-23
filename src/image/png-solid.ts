import {crc32} from '../utils/crc32.ts';

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const length = new Uint8Array(4);
	new DataView(length.buffer).setUint32(0, data.length, false);

	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);

	const crc = new Uint8Array(4);
	new DataView(crc.buffer).setUint32(0, crc32(body), false);

	const out = new Uint8Array(4 + body.length + 4);
	out.set(length, 0);
	out.set(body, 4);
	out.set(crc, 4 + body.length);
	return out;
}

/**
 * Encode a solid-color RGB PNG without external dependencies.
 */
export function solidPng(
	width: number,
	height: number,
	r: number,
	g: number,
	b: number,
): Uint8Array {
	const ihdr = new Uint8Array(13);
	const view = new DataView(ihdr.buffer);
	view.setUint32(0, width, false);
	view.setUint32(4, height, false);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const stride = width * 3 + 1;
	const raw = new Uint8Array(height * stride);
	for (let y = 0; y < height; y++) {
		const rowStart = y * stride;
		raw[rowStart] = 0; // filter none
		for (let x = 0; x < width; x++) {
			const px = rowStart + 1 + x * 3;
			raw[px] = r;
			raw[px + 1] = g;
			raw[px + 2] = b;
		}
	}

	const compressed = Bun.deflateSync(raw);
	const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const parts = [
		signature,
		chunk('IHDR', ihdr),
		chunk('IDAT', compressed),
		chunk('IEND', new Uint8Array(0)),
	];

	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}
