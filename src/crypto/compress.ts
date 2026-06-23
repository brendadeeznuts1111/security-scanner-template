export type CompressionFormat = 'gzip' | 'zstd';

const MAGIC = new Uint8Array([0x42, 0x53, 0x43]);
const FORMAT_GZIP = 1;
const FORMAT_ZSTD = 2;

function toBytes(input: Uint8Array | string): Uint8Array {
	return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

function compressRaw(bytes: Uint8Array, format: CompressionFormat): Uint8Array {
	const input = bytes as Uint8Array<ArrayBuffer>;
	return format === 'zstd' ? Bun.zstdCompressSync(input) : Bun.gzipSync(input);
}

function decompressRaw(bytes: Uint8Array, format: CompressionFormat): Uint8Array {
	const input = bytes as Uint8Array<ArrayBuffer>;
	return format === 'zstd' ? Bun.zstdDecompressSync(input) : Bun.gunzipSync(input);
}

/**
 * Compress bytes with a Bun-native codec and a small format header.
 */
export function compressBytes(
	input: Uint8Array | string,
	format: CompressionFormat = 'gzip',
): Uint8Array {
	const body = compressRaw(toBytes(input), format);
	const header = new Uint8Array(MAGIC.length + 1);
	header.set(MAGIC);
	header[3] = format === 'zstd' ? FORMAT_ZSTD : FORMAT_GZIP;

	const packed = new Uint8Array(header.length + body.length);
	packed.set(header);
	packed.set(body, header.length);
	return packed;
}

/**
 * Decompress a header-prefixed payload. Returns the input unchanged when no
 * header is present so legacy plain JSON cache files keep working.
 */
export function decompressBytes(input: Uint8Array): Uint8Array {
	if (
		input.length >= 4 &&
		input[0] === MAGIC[0] &&
		input[1] === MAGIC[1] &&
		input[2] === MAGIC[2]
	) {
		const format: CompressionFormat = input[3] === FORMAT_ZSTD ? 'zstd' : 'gzip';
		return decompressRaw(input.slice(4), format);
	}

	return input;
}

export function compressText(text: string, format: CompressionFormat = 'gzip'): Uint8Array {
	return compressBytes(text, format);
}

export function decompressText(input: Uint8Array): string {
	return new TextDecoder().decode(decompressBytes(input));
}
