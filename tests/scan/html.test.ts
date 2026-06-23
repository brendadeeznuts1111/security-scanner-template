import {expect, test} from 'bun:test';
import {scanHtmlResponse} from '../../src/scan/html.ts';

test('scanHtmlResponse flags inline eval scripts', async () => {
	const findings = await scanHtmlResponse(`
		<html><body>
			<script>eval('alert(1)')</script>
		</body></html>
	`);

	expect(findings.some(finding => finding.type === 'inline-script')).toBe(true);
});

test('scanHtmlResponse flags javascript: links', async () => {
	const findings = await scanHtmlResponse(`
		<html><body><a href="javascript:alert(1)">click</a></body></html>
	`);

	expect(findings.some(finding => finding.type === 'suspicious-url')).toBe(true);
});