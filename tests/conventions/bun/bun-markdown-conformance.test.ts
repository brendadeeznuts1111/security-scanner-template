/**
 * Parity checks against oven-sh/bun docs/runtime/markdown.mdx examples.
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/markdown.mdx
 */
import {expect, test} from 'bun:test';
import {generateMarkdownReport} from '../../../src/report/markdown.ts';
import type {ReportData} from '../../../src/report/types.ts';
import {
	DEFAULT_REPORT_MARKDOWN_OPTIONS,
	isMarkdownAvailable,
	markdownToAnsi,
	markdownToHtml,
	markdownToPlaintext,
	renderMarkdown,
} from '../../../src/markdown/index.ts';

test('isMarkdownAvailable reflects Bun.markdown.html', () => {
	expect(isMarkdownAvailable()).toBe(typeof Bun.markdown?.html === 'function');
});

test('docs: markdownToHtml renders headings and emphasis', () => {
	const html = markdownToHtml('# Hello **world**');
	expect(html).toContain('<h1>');
	expect(html).toContain('<strong>world</strong>');
});

test('docs: GFM tables render to HTML', () => {
	const html = markdownToHtml(
		`| Feature | Status |\n| --- | --- |\n| Tables | done |`,
		DEFAULT_REPORT_MARKDOWN_OPTIONS,
	);
	expect(html).toContain('<table>');
	expect(html).toContain('<td>Tables</td>');
});

test('docs: renderMarkdown applies custom callbacks', () => {
	const html = renderMarkdown('# Hello **world**', {
		heading: (children, meta) => `<h${meta?.level} class="title">${children}</h${meta?.level}>`,
		strong: children => `<b>${children}</b>`,
		paragraph: children => `<p>${children}</p>`,
	});
	expect(html).toContain('class="title"');
	expect(html).toContain('<b>world</b>');
});

test('docs: renderMarkdown can strip formatting to plaintext', () => {
	const text = markdownToPlaintext('# Hello **world**');
	expect(text?.replace(/\s+/g, ' ').trim()).toContain('Hello world');
});

test('docs: markdownToAnsi applies terminal styling', () => {
	const ansi = markdownToAnsi('This is **bold**');
	expect(ansi).toContain('\x1b[1m');
	expect(ansi).toContain('bold');
});

test('security report summary markdown converts for HTML dashboard', () => {
	const data: ReportData = {
		generatedAt: '2026-06-23T00:00:00.000Z',
		feedSource: 'test',
		riskScore: 10,
		fatalCount: 0,
		warnCount: 1,
		infoCount: 0,
		advisories: [],
		overrides: [],
		dryRun: false,
	};
	const md = generateMarkdownReport(data);
	const summary = md.split('## Advisories')[0] ?? md;
	const html = markdownToHtml(summary, DEFAULT_REPORT_MARKDOWN_OPTIONS);
	expect(html).toContain('<h1>');
	expect(html).toContain('<table>');
});
