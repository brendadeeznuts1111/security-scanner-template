import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {isImageAvailable, ThumbnailGenerator, thumbnailPathFor} from '../../src/visual/index.ts';
import {tinyPngBytes} from './fixture.ts';

test('isImageAvailable reflects Bun.Image presence', () => {
	expect(typeof isImageAvailable()).toBe('boolean');
});

test('thumbnailPathFor derives sidecar path', () => {
	expect(thumbnailPathFor('/tmp/scan.png')).toBe('/tmp/scan.thumb.webp');
	expect(thumbnailPathFor('/tmp/scan.png', 'jpeg')).toBe('/tmp/scan.thumb.jpeg');
});

test('ThumbnailGenerator saves resized image', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-thumb-'));
	const sourcePath = path.join(dir, 'source.png');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const dest = path.join(dir, 'thumb.webp');
		const written = await ThumbnailGenerator.save(sourcePath, dest, 32, 32, 'webp', 80);
		expect(written).toBe(dest);
		expect(Bun.file(dest).size).toBeGreaterThan(0);

		const {metadata} = await ThumbnailGenerator.generate(sourcePath, 32, 32, 'png');
		expect(metadata.width).toBeGreaterThan(0);
		expect(metadata.height).toBeGreaterThan(0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});
