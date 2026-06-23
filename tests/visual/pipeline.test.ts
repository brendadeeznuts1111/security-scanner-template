import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {ImagePipeline, isImageAvailable, webpPathFor} from '../../src/visual/index.ts';
import {tinyPngBytes} from './fixture.ts';

test('ImagePipeline inspects, strips EXIF, and converts to WebP', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-pipe-'));
	const sourcePath = path.join(dir, 'upload.png');
	const dest = path.join(dir, 'normalized.webp');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const result = await ImagePipeline.process(sourcePath, {
			inspect: true,
			stripExif: true,
			convertWebp: true,
			dest,
		});

		expect(result.strippedExif).toBe(true);
		expect(result.convertedToWebp).toBe(true);
		expect(result.format).toBe('webp');
		expect(result.normalizedPath).toBe(dest);
		expect(result.bytes.length).toBeGreaterThan(0);
		expect(Bun.file(dest).size).toBeGreaterThan(0);
		expect(result.inspection?.metadata.format).toBe('png');
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});

test('webpPathFor replaces extension with .webp', () => {
	expect(webpPathFor('/tmp/scan/screenshot.png')).toBe('/tmp/scan/screenshot.webp');
});
