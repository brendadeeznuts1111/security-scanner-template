import {expect, test} from 'bun:test';
import {escapeHtml, renderAdvisoryRows, safeJsonScript} from '../../src/report/safe.ts';

test('escapeHtml neutralizes script tags', () => {
	expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('safeJsonScript prevents script breakout', () => {
	const payload = safeJsonScript({description: '</script><script>alert(1)</script>'});
	expect(payload).not.toContain('</script>');
	expect(payload).toContain('\\u003c/script');
});

test('renderAdvisoryRows escapes package names', () => {
	const rows = renderAdvisoryRows([
		{
			level: 'fatal',
			package: '<evil>',
			version: '1.0.0',
			url: 'javascript:alert(1)',
			description: '<bad>',
			categories: ['malware'],
		},
	]);
	expect(rows).toContain('&lt;evil&gt;');
	expect(rows).toContain('&lt;bad&gt;');
	expect(rows).not.toContain('<evil>');
});
