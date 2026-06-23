/**
 * @see https://bun.com/docs/guides/util/escape-html
 */
import {expect, test} from 'bun:test';
import {
	BUN_ESCAPE_HTML_GUIDE_URL,
	escapeHtml,
	isEscapeHtmlAvailable,
} from '../../src/utils/escape-html.ts';

test('escape-html guide escapes script tags', () => {
	const escaped = escapeHtml("<script>alert('Hello World!')</script>");
	expect(escaped).toBe(Bun.escapeHTML("<script>alert('Hello World!')</script>"));
	expect(escaped).toContain('&lt;script&gt;');
	expect(escaped).toContain('&#x27;Hello World!&#x27;');
	expect(escaped).not.toContain('<script>');
});

test('escape-html replaces quotes ampersand and angle brackets', () => {
	expect(escapeHtml(`<a>&"'`)).toBe('&lt;a&gt;&amp;&quot;&#x27;');
});

test('escape-html coerces non-string inputs before escaping', () => {
	expect(escapeHtml(42)).toBe('42');
	expect(escapeHtml(true)).toBe('true');
});

test('isEscapeHtmlAvailable reflects Bun.escapeHTML presence', () => {
	expect(isEscapeHtmlAvailable()).toBe(typeof Bun.escapeHTML === 'function');
});

test('docs URL points at escape-html guide', () => {
	expect(BUN_ESCAPE_HTML_GUIDE_URL).toBe('https://bun.com/docs/guides/util/escape-html');
});
