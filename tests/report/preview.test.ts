import {expect, test} from 'bun:test';
import {previewHtmlReport} from '../../src/report/preview.ts';
import {isWebViewAvailable} from '../../src/report/webview.ts';
import type {ReportData} from '../../src/report/types.ts';

async function withWebView<T>(fn: () => Promise<T>): Promise<T | null> {
	if (!isWebViewAvailable()) {
		return null;
	}
	try {
		return await fn();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('WebView') || message.includes('browser')) {
			return null;
		}
		throw error;
	}
}

const fixture: ReportData = {
	generatedAt: '2026-06-23T00:00:00.000Z',
	feedSource: 'test',
	riskScore: 0,
	fatalCount: 0,
	warnCount: 0,
	infoCount: 0,
	advisories: [],
	overrides: [],
	dryRun: false,
};

test('previewHtmlReport renders report in Bun.WebView', async () => {
	const result = await withWebView(() => previewHtmlReport(fixture, {width: 800, height: 600}));
	if (!result) {
		return;
	}
	expect(result.title).toContain('Security Report');
	expect(result.url.startsWith('data:text/html')).toBe(true);
});
