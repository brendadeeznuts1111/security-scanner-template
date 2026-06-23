import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {
	processWebScreenshot,
	scanWebSecurity,
} from '../../src/scan/web-security.ts';
import {isImageAvailable} from '../../src/visual/load.ts';
import {tinyPngBytes} from '../visual/fixture.ts';

test('scanWebSecurity flags missing CSP header', async () => {
	const result = await scanWebSecurity('<html><body>ok</body></html>', {});
	expect(result.findings.some(f => f.type === 'csp-missing')).toBe(true);
	expect(result.screenshot).toBeUndefined();
});

test('scanWebSecurity flags weak CSP directives', async () => {
	const result = await scanWebSecurity('<html></html>', {
		'content-security-policy': "default-src 'self' 'unsafe-inline'",
	});
	expect(result.findings.some(f => f.type === 'csp-weak')).toBe(true);
});

test('scanWebSecurity combines HTMLRewriter findings', async () => {
	const result = await scanWebSecurity(
		'<html><script>eval("1")</script></html>',
		{'content-security-policy': "default-src 'self'"},
		{rendered: false},
	);
	expect(result.findings.some(f => f.type === 'xss-dangerous-html')).toBe(true);
});

test('processWebScreenshot generates thumbnail and placeholder artifacts', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const dir = await mkdtemp(path.join(os.tmpdir(), 'web-sec-shot-'));

	try {
		const artifact = await processWebScreenshot(tinyPngBytes(), {
			screenshotDir: dir,
			screenshotId: 'scan-1',
		});

		expect(artifact.fullBytes.length).toBeGreaterThan(0);
		expect(artifact.placeholderDataUrl?.startsWith('data:image/')).toBe(true);
		expect(artifact.thumbnailBytes?.length).toBeGreaterThan(0);
		expect(artifact.fullPath).toBe(path.join(dir, 'scan-1.webp'));
		expect(artifact.normalizedPath).toBe(path.join(dir, 'scan-1.webp'));
		expect(artifact.thumbnailPath).toBe(path.join(dir, 'scan-1.thumb.webp'));
		expect(artifact.inspection?.metadata.format).toBe('png');
		expect(Bun.file(artifact.fullPath!).size).toBeGreaterThan(0);
		expect(Bun.file(artifact.thumbnailPath!).size).toBeGreaterThan(0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});