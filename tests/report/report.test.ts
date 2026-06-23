import {expect, test} from 'bun:test';
import {
	generateJsonReport,
	generateMarkdownReport,
	generateHtmlReport,
	computeRiskScore,
} from '../../src/report/index.ts';
import type {ReportData} from '../../src/report/types.ts';

function reportFixture(overrides: Partial<ReportData> = {}): ReportData {
	return {
		generatedAt: '2026-06-23T00:00:00.000Z',
		feedSource: 'test',
		riskScore: 50,
		fatalCount: 1,
		warnCount: 1,
		infoCount: 0,
		advisories: [
			{
				level: 'fatal',
				package: 'bad-pkg',
				version: '1.0.0',
				url: 'https://example.com',
				description: 'Malicious',
				categories: ['malware'],
			},
			{
				level: 'warn',
				package: 'old-pkg',
				version: '2.0.0',
				url: null,
				description: 'Deprecated',
				categories: ['deprecated'],
			},
		],
		overrides: [{package: 'trusted-*', action: 'ignore', reason: 'Internal'}],
		dryRun: false,
		...overrides,
	};
}

test('generateJsonReport returns valid JSON', () => {
	const json = generateJsonReport(reportFixture());
	const parsed = JSON.parse(json);
	expect(parsed.feedSource).toBe('test');
	expect(parsed.advisories.length).toBe(2);
	expect(parsed.fatalCount).toBe(1);
});

test('generateMarkdownReport includes summary and advisories', () => {
	const md = generateMarkdownReport(reportFixture());
	expect(md).toContain('# Security Report');
	expect(md).toContain('bad-pkg');
	expect(md).toContain('old-pkg');
	expect(md).toContain('Internal');
	expect(md).toContain('| Fatal');
	expect(md).toContain('| 1      |');
});

test('generateMarkdownReport shows clean state when no advisories', () => {
	const md = generateMarkdownReport(
		reportFixture({advisories: [], fatalCount: 0, warnCount: 0, riskScore: 0}),
	);
	expect(md).toContain('No advisories detected');
});

test('generateHtmlReport injects data into the template', async () => {
	const html = await generateHtmlReport(reportFixture());
	expect(html).toContain('<title>Security Report</title>');
	expect(html).toContain('"feedSource":"test"');
	expect(html).toContain('bad-pkg');
});

test('computeRiskScore is 0 for clean scans', () => {
	expect(computeRiskScore(0, 0, 0)).toBe(0);
});

test('computeRiskScore caps at 100', () => {
	expect(computeRiskScore(100, 0, 0)).toBe(100);
});

test('computeRiskScore weights fatal higher than warn', () => {
	expect(computeRiskScore(1, 0, 0)).toBeGreaterThan(computeRiskScore(0, 1, 0));
});
