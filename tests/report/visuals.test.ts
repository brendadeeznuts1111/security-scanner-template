import {expect, test} from 'bun:test';
import {generateHtmlReport} from '../../src/report/html.ts';
import {
	renderOperatorQr,
	renderVisualGallery,
	resolveReportVisuals,
} from '../../src/report/visuals.ts';
import {ReportGenerator} from '../../src/report/generator.ts';
import type {ReportData} from '../../src/report/types.ts';

function reportFixture(overrides: Partial<ReportData> = {}): ReportData {
	return {
		generatedAt: '2026-06-23T00:00:00.000Z',
		feedSource: 'test',
		riskScore: 0,
		fatalCount: 0,
		warnCount: 0,
		infoCount: 0,
		advisories: [],
		overrides: [],
		dryRun: false,
		...overrides,
	};
}

test('renderOperatorQr embeds domain QR with sensitivity warning', () => {
	const html = renderOperatorQr({
		domain: 'com.example.ledger',
		dataUrl: 'data:image/png;base64,abc',
		cacheKey: 'deadbeef',
	});

	expect(html).toContain('operator-qr');
	expect(html).toContain('com.example.ledger');
	expect(html).toContain('data:image/png;base64,abc');
	expect(html).toContain('Sensitive');
	expect(html).toContain('deadbeef');
});

test('renderOperatorQr returns empty string when dataUrl is missing', () => {
	expect(renderOperatorQr(undefined)).toBe('');
});

test('renderVisualGallery embeds lazy-loading placeholders', () => {
	const html = renderVisualGallery([
		{
			id: 'audit-1',
			label: 'phishing-shot',
			placeholderDataUrl: 'data:image/png;base64,abc',
			imagePath: '/tmp/full.png',
		},
	]);

	expect(html).toContain('Visual Audit Artifacts');
	expect(html).toContain('loading="lazy"');
	expect(html).toContain('data-src="/tmp/full.png"');
	expect(html).toContain('phishing-shot');
});

test('resolveReportVisuals preserves existing placeholders', async () => {
	const resolved = await resolveReportVisuals([
		{
			id: 'audit-2',
			placeholderDataUrl: 'data:image/png;base64,xyz',
		},
	]);

	expect(resolved[0]?.placeholderDataUrl).toBe('data:image/png;base64,xyz');
});

test('generateHtmlReport includes operator QR and strips token from embedded JSON', async () => {
	const html = await generateHtmlReport(
		reportFixture({
			operatorQr: {
				domain: 'com.example.ops',
				dataUrl: 'data:image/png;base64,qrpayload',
				cacheKey: 'cafebabe',
			},
		}),
	);

	expect(html).toContain('operator-qr');
	expect(html).toContain('data:image/png;base64,qrpayload');
	expect(html).toContain('cafebabe');

	const embeddedJson = html.split('const data = ')[1]?.split(';')[0] ?? '';
	expect(embeddedJson).not.toContain('qrpayload');
	expect(embeddedJson).toContain('"dataUrl":""');
});

test('generateHtmlReport includes visual gallery section', async () => {
	const html = await generateHtmlReport(
		reportFixture({
			visuals: [
				{
					id: 'audit-3',
					label: 'scan',
					placeholderDataUrl: 'data:image/png;base64,thumb',
					thumbnailPath: '/tmp/scan.thumb.webp',
				},
			],
		}),
	);

	expect(html).toContain('visual-gallery');
	expect(html).toContain('visual-lazy');
});

test('ReportGenerator.visualsFromAudit maps audit visual metadata', () => {
	const generator = new ReportGenerator();
	const visuals = generator.visualsFromAudit([
		{
			id: 'entry-1',
			package: 'web-scan',
			version: '1.0.0',
			requestedRange: '*',
			advisories: [],
			allowed: true,
			decidedAt: '2026-06-23T00:00:00.000Z',
			visual: {
				imagePath: '/tmp/full.png',
				thumbnailPath: '/tmp/full.thumb.webp',
				placeholderDataUrl: 'data:image/png;base64,abc',
			},
		},
	]);

	expect(visuals).toHaveLength(1);
	expect(visuals[0]?.label).toBe('web-scan');
	expect(visuals[0]?.thumbnailPath).toBe('/tmp/full.thumb.webp');
});
