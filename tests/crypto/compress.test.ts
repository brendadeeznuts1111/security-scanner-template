import {expect, test} from 'bun:test';
import {
	compressBytes,
	compressText,
	decompressBytes,
	decompressText,
} from '../../src/crypto/compress.ts';

test('gzip round-trip preserves text', () => {
	const original = JSON.stringify({rules: [{package: 'x', range: '1.0.0'}]});
	const packed = compressText(original, 'gzip');
	const restored = decompressText(packed);
	expect(restored).toBe(original);
});

test('zstd round-trip preserves bytes', () => {
	const original = new TextEncoder().encode('threat-feed-cache-payload');
	const packed = compressBytes(original, 'zstd');
	const restored = decompressBytes(packed);
	expect(new TextDecoder().decode(restored)).toBe('threat-feed-cache-payload');
});

test('decompressBytes leaves legacy plain JSON untouched', () => {
	const legacy = new TextEncoder().encode('{"url":"x"}');
	expect(decompressBytes(legacy)).toEqual(legacy);
});
