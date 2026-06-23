import {expect, test, beforeEach, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {buildOperatorQrForDomain} from '../../src/report/operator-qr.ts';
import {ReportGenerator} from '../../src/report/generator.ts';
import {DEFAULT_MASTER_KEY_NAME} from '../../src/config/master-key.ts';

let originalSecrets: typeof Bun.secrets;

function testRegistry(config: DomainConfig): DomainRegistry {
	return {
		root: process.cwd(),
		async loadAll() {},
		async ensureDomain() {},
		get(domain: string) {
			if (domain !== config.domain) throw new Error(`Unknown domain: ${domain}`);
			return config;
		},
		has(domain: string) {
			return domain === config.domain;
		},
		list() {
			return [config.domain];
		},
		async security() {
			throw new Error('not used');
		},
		async service() {
			throw new Error('not used');
		},
		watch() {},
		unwatch() {},
		async checkPackageVersions() {
			return [];
		},
		async scanPatterns() {
			return [];
		},
		async loadThreatFeed() {},
		checkPackageThreats() {
			return [];
		},
		checkPackagesThreats() {
			return new Map();
		},
		getLoadedThreats() {
			return [];
		},
		async reloadDomain() {
			return null;
		},
	};
}

beforeEach(() => {
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

afterEach(() => {
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
});

test('buildOperatorQrForDomain returns PNG data URL from Bun.secrets master key', async () => {
	const config = applyDefaults({
		domain: 'com.example.report-qr',
		secrets: {service: 'com.example.report-qr', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.report-qr',
		name: DEFAULT_MASTER_KEY_NAME,
		value: 'report-master-token',
	});

	const operatorQr = await buildOperatorQrForDomain(testRegistry(config), config.domain);
	expect(operatorQr?.domain).toBe(config.domain);
	expect(operatorQr?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
	expect(operatorQr?.cacheKey?.length).toBeGreaterThan(0);
});

test('ReportGenerator.htmlWithOperatorQr embeds operator QR section', async () => {
	const config = applyDefaults({
		domain: 'com.example.report-html',
		secrets: {service: 'com.example.report-html', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.report-html',
		name: DEFAULT_MASTER_KEY_NAME,
		value: 'html-master-token',
	});

	const generator = new ReportGenerator();
	const html = await generator.htmlWithOperatorQr(
		{
			generatedAt: '2026-06-23T00:00:00.000Z',
			feedSource: 'test',
			riskScore: 0,
			fatalCount: 0,
			warnCount: 0,
			infoCount: 0,
			advisories: [],
			overrides: [],
			dryRun: false,
		},
		config.domain,
		testRegistry(config),
	);

	expect(html).toContain('operator-qr');
	expect(html).toContain('com.example.report-html');
});
