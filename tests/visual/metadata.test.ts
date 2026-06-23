import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {ImageMetadataAnalyzer, isImageAvailable} from '../../src/visual/index.ts';
import {tinyPngBytes} from './fixture.ts';

test('ImageMetadataAnalyzer returns metadata for valid images', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-meta-'));
	const sourcePath = path.join(dir, 'source.png');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const inspection = await ImageMetadataAnalyzer.inspect(sourcePath);
		expect(inspection.metadata.width).toBeGreaterThan(0);
		expect(inspection.metadata.height).toBeGreaterThan(0);
		expect(inspection.anomalies).toEqual([]);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});

test('ImageMetadataAnalyzer flags unusual formats', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-meta-fmt-'));
	const sourcePath = path.join(dir, 'source.png');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const inspection = await ImageMetadataAnalyzer.inspect(sourcePath, {
			allowedFormats: ['jpeg'],
		});
		expect(inspection.anomalies.some(a => a.code === 'unusual-format')).toBe(true);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});