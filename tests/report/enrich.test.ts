import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {applyDefaults} from '../../src/config/defaults.ts';
import {DEFAULT_MASTER_KEY_NAME} from '../../src/config/master-key.ts';
import {generateEnrichedReport, sanitizeOperatorQrForExport} from '../../src/report/enrich.ts';
import {generateMarkdownReport} from '../../src/report/markdown.ts';
import {generateJsonReport} from '../../src/report/json.ts';
import type {ReportData} from '../../src/report/types.ts';

const baseData = (): ReportData => ({
	generatedAt: '2026-06-23T00:00:00.000Z',
	feedSource: 'test',
	riskScore: 0,
	fatalCount: 0,
	warnCount: 0,
	infoCount: 0,
	advisories: [],
	overrides: [],
	dryRun: false,
});

let root = '';
let originalSecrets: typeof Bun.secrets;

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), 'report-enrich-'));
	originalSecrets = Bun.secrets;
	const store: Record<string, string> = {};
	(Bun as unknown as {secrets: unknown}).secrets = {
		get: async (opts: {service: string; name: string}) =>
			store[`${opts.service}/${opts.name}`] ?? null,
		set: async (opts: {service: string; name: string; value: string}) => {
			store[`${opts.service}/${opts.name}`] = opts.value;
		},
		delete: async () => false,
	};
});

afterEach(async () => {
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
	await rm(root, {recursive: true, force: true}).catch(() => {});
});

async function writeDomain(domain: string): Promise<void> {
	await mkdir(`${root}/domains`, {recursive: true});
	await Bun.write(
		`${root}/domains/${domain.replace(/\./g, '-')}.security.json5`,
		`{ domain: "${domain}", ops: { report: { operatorQr: { enabled: true, size: 128 } } } }`,
	);
	await Bun.secrets.set({
		service: domain,
		name: DEFAULT_MASTER_KEY_NAME,
		value: `token-for-${domain}`,
	});
}

test('generateEnrichedReport embeds operator QR in HTML for project domain', async () => {
	await writeDomain('com.example.enrich-html');

	const html = await generateEnrichedReport(baseData(), 'html', {
		root,
		domain: 'com.example.enrich-html',
	});
	expect(html).toContain('operator-qr');
	expect(html).toContain('com.example.enrich-html');
});

test('generateEnrichedReport adds operator section to markdown', async () => {
	await writeDomain('com.example.enrich-md');

	const md = await generateEnrichedReport(baseData(), 'markdown', {
		root,
		domain: 'com.example.enrich-md',
	});
	expect(md).toContain('## Operator Access');
	expect(md).toContain('com.example.enrich-md');
	expect(md).toContain('bun sp qr --domain');
});

test('generateJsonReport strips operator QR dataUrl from exports', () => {
	const json = generateJsonReport({
		...baseData(),
		operatorQr: {
			domain: 'com.example.json',
			dataUrl: 'data:image/png;base64,secret',
			cacheKey: 'abc',
		},
	});
	const parsed = JSON.parse(json);
	expect(parsed.operatorQr.cacheKey).toBe('abc');
	expect(parsed.operatorQr.dataUrl).toBe('');
	expect(JSON.stringify(parsed)).not.toContain('secret');
});

test('sanitizeOperatorQrForExport omits dataUrl', () => {
	const meta = sanitizeOperatorQrForExport({
		domain: 'com.example.meta',
		dataUrl: 'data:image/png;base64,x',
		cacheKey: 'ff',
	});
	expect(meta?.domain).toBe('com.example.meta');
	expect(meta).not.toHaveProperty('dataUrl');
});

test('generateEnrichedReport skips QR when operatorQr disabled in domain config', async () => {
	await mkdir(`${root}/domains`, {recursive: true});
	await Bun.write(
		`${root}/domains/off.security.json5`,
		'{ domain: "com.example.qr-off", ops: { report: { operatorQr: { enabled: false } } } }',
	);

	const html = await generateEnrichedReport(baseData(), 'html', {
		root,
		domain: 'com.example.qr-off',
	});
	expect(html).not.toContain('<section class="operator-qr"');
});
