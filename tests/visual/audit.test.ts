import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {AuditVisualProcessor, isImageAvailable} from '../../src/visual/index.ts';
import type {AuditEntry} from '../../src/audit/types.ts';
import {tinyPngBytes} from './fixture.ts';

const sampleEntry = (): AuditEntry => ({
	id: 'audit-visual-test',
	package: 'example/pkg',
	version: '1.0.0',
	requestedRange: '*',
	advisories: [],
	allowed: true,
	decidedAt: new Date().toISOString(),
});

test('AuditVisualProcessor enriches entry with visual metadata', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-audit-'));
	const sourcePath = path.join(dir, 'screenshot.png');
	await Bun.write(sourcePath, tinyPngBytes());

	try {
		const enriched = await AuditVisualProcessor.enrich(sampleEntry(), sourcePath, {
			imagePath: sourcePath,
			outDir: dir,
		});

		expect(enriched.visual?.normalizedPath).toBeDefined();
		expect(enriched.visual?.thumbnailPath).toBeDefined();
		expect(enriched.visual?.placeholderDataUrl?.startsWith('data:image/')).toBe(true);
		expect(Bun.file(enriched.visual!.normalizedPath!).size).toBeGreaterThan(0);
		expect(Bun.file(enriched.visual!.thumbnailPath!).size).toBeGreaterThan(0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});
