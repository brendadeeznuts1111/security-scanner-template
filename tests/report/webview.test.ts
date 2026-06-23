import {expect, test, describe} from 'bun:test';
import {isWebViewAvailable, screenshotHtml} from '../../src/report/webview.ts';
import {ReportGenerator} from '../../src/report/generator.ts';

const html = `
<!doctype html>
<html>
<head><title>Test Report</title></head>
<body>
<h1>Security Report</h1>
<p style="color: red;">2 threats detected</p>
</body>
</html>
`;

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

describe('report webview', () => {
	test('isWebViewAvailable is a boolean', () => {
		expect(typeof isWebViewAvailable()).toBe('boolean');
	});

	test('screenshotHtml captures a PNG for simple HTML', async () => {
		const result = await withWebView(() =>
			screenshotHtml({
				html,
				width: 800,
				height: 600,
				format: 'png',
			}),
		);
		if (!result) {
			return;
		}
		expect(result.bytes.length).toBeGreaterThan(0);
		expect(result.bytes[0]).toBe(0x89);
		expect(result.bytes[1]).toBe(0x50);
		expect(result.bytes[2]).toBe(0x4e);
		expect(result.bytes[3]).toBe(0x47);
		expect(result.width).toBe(800);
		expect(result.height).toBe(600);
	});

	test('ReportGenerator.screenshot produces an image', async () => {
		const generator = new ReportGenerator();
		const result = await withWebView(() =>
			generator.screenshot(
				{
					generatedAt: new Date().toISOString(),
					feedSource: 'test',
					riskScore: 0,
					fatalCount: 0,
					warnCount: 1,
					infoCount: 0,
					advisories: [
						{
							level: 'warn',
							package: 'test-pkg',
							version: '1.0.0',
							url: null,
							description: 'Test advisory',
							categories: ['deprecated'],
						},
					],
					overrides: [],
					dryRun: false,
				},
				{width: 640, height: 480, format: 'png'},
			),
		);
		if (!result) {
			return;
		}
		expect(result.bytes.length).toBeGreaterThan(0);
		expect(result.width).toBe(640);
		expect(result.height).toBe(480);
	});
});
