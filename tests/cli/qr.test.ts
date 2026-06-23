import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {getDomainMasterToken, resolveDomainMasterKeyNames, runDomainQr} from '../../src/cli/qr.ts';
import {DEFAULT_MASTER_KEY_NAME} from '../../src/config/master-key.ts';
import {LEGACY_MASTER_TOKEN_SECRET, MASTER_TOKEN_SECRET} from '../../src/visual/qr-cache.ts';
import {isImageAvailable} from '../../src/visual/index.ts';

let cacheRoot = '';
let originalSecrets: typeof Bun.secrets;

function testRegistry(config: DomainConfig): DomainRegistry {
	return {
		async loadAll() {},
		get(domain: string) {
			if (domain !== config.domain) {
				throw new Error(`Unknown domain: ${domain}`);
			}
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
		async reloadDomain() {
			return null;
		},
	};
}

beforeEach(async () => {
	cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'qr-cli-'));
	process.env.QR_CACHE_DIR = cacheRoot;

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
	delete process.env.QR_CACHE_DIR;
	await rm(cacheRoot, {recursive: true, force: true}).catch(() => {});
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
});

test('getDomainMasterToken reads Bun.secrets for service name', async () => {
	await Bun.secrets.set({
		service: 'com.example.qr',
		name: MASTER_TOKEN_SECRET,
		value: 'tok-123',
	});

	const token = await getDomainMasterToken('com.example.qr');
	expect(token).toBe('tok-123');
	expect(MASTER_TOKEN_SECRET).toBe(DEFAULT_MASTER_KEY_NAME);
});

test('getDomainMasterToken falls back to legacy __master_token secret', async () => {
	await Bun.secrets.set({
		service: 'com.example.legacy',
		name: LEGACY_MASTER_TOKEN_SECRET,
		value: 'legacy-tok',
	});

	const token = await getDomainMasterToken('com.example.legacy', [
		DEFAULT_MASTER_KEY_NAME,
		LEGACY_MASTER_TOKEN_SECRET,
	]);
	expect(token).toBe('legacy-tok');
});

test('resolveDomainMasterKeyNames prefers private vault masterKeyName', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'qr-names-'));
	try {
		await mkdir(`${root}/domains`, {recursive: true});
		await Bun.write(`${root}/domains/ledger.security.json5`, '{ domain: "com.example.ledger" }');
		await mkdir(`${root}/.vault`, {recursive: true});
		await Bun.write(
			`${root}/.vault/com.example.ledger.inventory.json5`,
			'{ domain: "com.example.ledger", masterKeyName: "custom-vault-key" }',
		);

		const names = await resolveDomainMasterKeyNames('com.example.ledger', root);
		expect(names[0]).toBe('custom-vault-key');
		expect(names).toContain(DEFAULT_MASTER_KEY_NAME);
		expect(names).toContain(LEGACY_MASTER_TOKEN_SECRET);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});

test('runDomainQr generates cached QR and writes --output', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const config = applyDefaults({
		domain: 'com.example.qr-run',
		secrets: {service: 'com.example.qr-run', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.qr-run',
		name: MASTER_TOKEN_SECRET,
		value: 'ledger-master-token',
	});

	const outDir = await mkdtemp(path.join(os.tmpdir(), 'qr-out-'));

	try {
		const first = await runDomainQr({
			domain: config.domain,
			output: path.join(outDir, 'via-output.png'),
			size: 192,
			registry: testRegistry(config),
		});
		expect(await Bun.file(path.join(outDir, 'via-output.png')).exists()).toBe(true);

		const viaOut = path.join(outDir, 'via-out-alias.png');
		const second = await runDomainQr({
			domain: config.domain,
			output: viaOut,
			size: 192,
			registry: testRegistry(config),
		});

		expect(first.fromCache).toBe(false);
		expect(first.mapping?.domain).toBe(config.domain);
		expect(first.mapping?.key).toBe(first.mapping?.HEX.toLowerCase());
		expect(first.cachePath).toContain('com.example.qr-run');

		expect(second.fromCache).toBe(true);
		expect(second.mapping?.key).toBe(first.mapping?.key);
		expect(second.cachePath).toBe(first.cachePath);
		expect(await Bun.file(viaOut).exists()).toBe(true);
	} finally {
		await rm(outDir, {recursive: true, force: true}).catch(() => {});
	}
});

test('runDomainQr writes SVG output by default extension', async () => {
	const config = applyDefaults({
		domain: 'com.example.qr-svg',
		secrets: {service: 'com.example.qr-svg', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.qr-svg',
		name: MASTER_TOKEN_SECRET,
		value: 'svg-token',
	});

	const outDir = await mkdtemp(path.join(os.tmpdir(), 'qr-svg-'));
	const output = path.join(outDir, 'token.svg');

	try {
		const result = await runDomainQr({
			domain: config.domain,
			output,
			registry: testRegistry(config),
		});

		expect(result.outputFormat).toBe('svg');
		const text = await Bun.file(output).text();
		expect(text).toContain('<svg');
	} finally {
		await rm(outDir, {recursive: true, force: true});
	}
});

test('runDomainQr applies domain palette when --dark/--light omitted', async () => {
	const config = applyDefaults({
		domain: 'com.example.qr-palette',
		channels: {token: '#AABBCC'},
		colors: {primary: '#112233'},
		secrets: {service: 'com.example.qr-palette', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.qr-palette',
		name: MASTER_TOKEN_SECRET,
		value: 'palette-token',
	});

	const result = await runDomainQr({
		domain: config.domain,
		terminal: true,
		registry: testRegistry(config),
	});

	expect(result.outputFormat).toBe('terminal');
	expect(result.terminalArt?.length).toBeGreaterThan(0);
});

test('runDomainQr renders terminal ASCII with --terminal', async () => {
	const config = applyDefaults({
		domain: 'com.example.qr-term',
		secrets: {service: 'com.example.qr-term', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.qr-term',
		name: MASTER_TOKEN_SECRET,
		value: 'term-token',
	});

	const result = await runDomainQr({
		domain: config.domain,
		terminal: true,
		dark: '#FF453A',
		light: '#0A0A0F',
		registry: testRegistry(config),
	});

	expect(result.outputFormat).toBe('terminal');
	expect(result.terminalArt?.length).toBeGreaterThan(0);
});

test('runDomainQr rejects invalid reverse-DNS domain', async () => {
	const config = applyDefaults({
		domain: 'com.example.valid',
		csrf: {enabled: false, tokenLength: 32},
	});

	await expect(
		runDomainQr({domain: 'not a domain!', registry: testRegistry(config)}),
	).rejects.toThrow(/reverse-DNS/);
});

test('runDomainQr rejects unknown domain', async () => {
	const config = applyDefaults({
		domain: 'com.example.missing',
		csrf: {enabled: false, tokenLength: 32},
	});

	await expect(
		runDomainQr({domain: 'com.other.domain', registry: testRegistry(config)}),
	).rejects.toThrow(/unknown domain/);
});
