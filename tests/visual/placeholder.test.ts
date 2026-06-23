import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {isImageAvailable, PlaceholderGenerator} from '../../src/visual/index.ts';
import {tinyPngBytes} from './fixture.ts';

test('PlaceholderGenerator returns a Bun.Image placeholder data URL', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-ph-'));
	const sourcePath = path.join(dir, 'source.png');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const dataUrl = await PlaceholderGenerator.generate(sourcePath);
		expect(dataUrl.startsWith('data:image/')).toBe(true);
		expect(dataUrl.includes('base64,')).toBe(true);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});