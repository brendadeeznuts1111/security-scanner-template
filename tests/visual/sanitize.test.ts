import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {ImageSanitizer, isImageAvailable} from '../../src/visual/index.ts';
import {tinyPngBytes} from './fixture.ts';

test('ImageSanitizer re-encodes to webp bytes', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const result = await ImageSanitizer.stripMetadata(tinyPngBytes(), 'webp', 80);
	expect(result.format).toBe('webp');
	expect(result.bytes.length).toBeGreaterThan(0);
	const metadata = await result.image.metadata();
	expect(metadata.width).toBeGreaterThan(0);
	expect(metadata.height).toBeGreaterThan(0);
});

test('ImageSanitizer.stripMetadataToFile writes output', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-sanitize-'));
	const sourcePath = path.join(dir, 'source.png');
	const dest = path.join(dir, 'clean.webp');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const result = await ImageSanitizer.stripMetadataToFile(sourcePath, dest, 'webp', 80);
		expect(result.path).toBe(dest);
		expect(Bun.file(dest).size).toBeGreaterThan(0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});